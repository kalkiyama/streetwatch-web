import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as sat from "satellite.js";

// ─────────────────────────────────────────────────────────────────────────────
// A real sphere, not a projection. Two things come free here that the flat map had to fake:
//
//   1. THE TERMINATOR. On the map it was a drawn curve from solar geometry. Here it is just
//      lighting — put a directional light at the sun's real position and the day/night boundary
//      is wherever the light stops. Physically correct rather than approximated.
//   2. ORBITS LOOK LIKE ORBITS. On an equirectangular map a circular orbit renders as a sine
//      wave, which the flat view's footnote had to apologise for. On a globe it is a circle.
//
// Loaded lazily by SpaceView so three.js never enters the main bundle.
// ─────────────────────────────────────────────────────────────────────────────

let spin = 0;                      // Earth rotation angle, radians, shared by every placement
const R = 1;                       // Earth radius in scene units

// Geodetic to scene coordinates. Y is up, and longitude is offset so the texture's prime meridian
// lands where it should — an equirectangular image starts at -180.
function toVec(latDeg, lonDeg, altKm, out) {
  const lat = (latDeg * Math.PI) / 180;
  // SPIN is added to every longitude, not applied to the Earth mesh alone. Satellites, the ISS and
  // the sun are all placed in Earth-fixed coordinates, so turning only the planet would leave them
  // hanging over the wrong continents. Folding the angle into the shared transform keeps the whole
  // scene consistent, and avoids reparenting — which would break the ISS label's screen projection.
  // +180 because three.js SphereGeometry begins its texture wrap at phi = 0, which on an
  // equirectangular image is longitude -180, not Greenwich. Without the offset every object —
  // satellites, the ISS, and the sun that lights the terminator — sits exactly half a world
  // away from where it belongs, consistently enough to look deliberate.
  const lon = ((lonDeg + 180) * Math.PI) / 180 + spin;
  // Altitude is COMPRESSED, not linear. Geostationary sits at 35,786km — 5.6 Earth radii — so a
  // true-to-scale globe puts GPS and GEO far outside the frame while LEO hugs the surface, and
  // three of the eight groups appear to be missing entirely. A log curve keeps the ordering
  // honest (higher is visibly higher) inside a frame that holds everything at once.
  const r = R * (1 + 0.42 * Math.log1p(Math.max(0, altKm) / 1600));
  out.set(
    -r * Math.cos(lat) * Math.cos(lon),
     r * Math.sin(lat),
     r * Math.cos(lat) * Math.sin(lon)
  );
  return out;
}

// Solar declination and subsolar longitude — same maths the flat view used, but here it aims a
// light instead of drawing a curve.
function solar(date) {
  const n = (date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  const L = ((280.46 + 0.9856474 * n) * Math.PI) / 180;
  const lambda = L + ((1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = (23.439 * Math.PI) / 180;
  const declDeg = (Math.asin(Math.sin(eps) * Math.sin(lambda)) * 180) / Math.PI;
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return { lat: declDeg, lon: -15 * (utcH - 12) };
}

export default function SpaceGlobe({ on, satsRef, colors, textureUrl, speed, onCount, iss }) {
  const hostRef = useRef(null);
  const labelRef = useRef(null);
  const zoomRef = useRef(null);
  // Everything mutable that the animation loop touches lives here, so prop changes never tear
  // down the scene — rebuilding a WebGL context on every toggle would stutter badly.
  const liveRef = useRef({ on, speed, satsRef, colors, iss });
  // Written in an effect, not during render: the scene reads these every frame, and a render-phase
  // write would be a side effect on a value React does not track.
  useEffect(() => { liveRef.current = { on, speed, satsRef, colors, iss }; }, [on, speed, satsRef, colors, iss]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(0, 1.2, 3.4);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;   // no WebGL — SpaceView keeps the flat map available
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;
    controls.minDistance = 1.35;
    controls.maxDistance = 8;
    controls.enablePan = false;
    // Decorative drift only at LIVE, where the true rotation is too slow to see. Once time is
    // accelerated the planet turns for real and a second, unrelated spin would fight it.
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    // Any touch of the globe stops the idle spin; it resumes after a pause so the view never
    // feels like it is fighting the person using it.
    let idle, userActive = false;
    const wake = () => {
      userActive = true;
      controls.autoRotate = false;
      clearTimeout(idle);
      idle = setTimeout(() => { userActive = false; }, 6000);
    };
    controls.addEventListener("start", wake);

    // Pinch and scroll already zoom, but neither is discoverable — there is nothing on screen
    // saying the globe can be zoomed at all. Buttons make it obvious to someone who has never
    // manipulated a 3D view, which on a public site is most people.
    zoomRef.current = (factor) => {
      const d = camera.position.length();
      const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, d * factor));
      camera.position.setLength(next);
      wake();
      controls.update();
    };

    // ── Earth ────────────────────────────────────────────────────────────────
    // Day and night are blended in a SHADER rather than lit by the scene light, because the night
    // side needs to show something other than darkness: NASA's Black Marble city-lights layer,
    // which is the clearest picture of where people actually live that exists. A standard material
    // can only darken the far side; this one swaps in a different image there.
    //
    // The blend follows the same sun direction that positions the light, so the terminator stays
    // physically correct — city lights appear exactly where the sun has set.
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap:   { value: null },
        nightMap: { value: null },
        sunDir:   { value: new THREE.Vector3(1, 0, 0) },
        hasNight: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN;
        void main() {
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D dayMap; uniform sampler2D nightMap;
        uniform vec3 sunDir; uniform float hasNight;
        varying vec2 vUv; varying vec3 vN;
        void main() {
          vec3 day = texture2D(dayMap, vUv).rgb;
          float l = dot(normalize(vN), normalize(sunDir));
          // A soft band rather than a hard edge: the real terminator is a gradient tens of
          // kilometres wide, and a razor line looks like a rendering artefact.
          float t = smoothstep(-0.12, 0.18, l);
          // Blue Marble is shaded relief with no atmosphere or cloud, so it is far darker than
          // VIIRS true colour to begin with; multiplying it down again left the sunlit half
          // looking like dusk. A gain above 1 on the day side restores the contrast between the
          // two halves without touching where the terminator falls.
          vec3 lit = day * (0.12 + 1.45 * t);
          if (hasNight > 0.5) {
            vec3 night = texture2D(nightMap, vUv).rgb;
            // Added, not mixed: lights sit ON the dark surface instead of replacing it.
            lit += night * (1.0 - t) * 1.35;
          }
          gl_FragColor = vec4(lit, 1.0);
        }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMat);
    scene.add(earth);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(textureUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      earthMat.uniforms.dayMap.value = tex;
    }, undefined, () => {
      // A failed basemap left dayMap null, which samples as pure black — the globe looked like
      // permanent night with city lights everywhere, which is a wrong claim rather than a missing
      // image. A plain blue fallback is honestly "no imagery" instead.
      const c = document.createElement("canvas"); c.width = c.height = 2;
      const cx = c.getContext("2d"); cx.fillStyle = "#2b4a6b"; cx.fillRect(0, 0, 2, 2);
      const fb = new THREE.CanvasTexture(c); fb.colorSpace = THREE.SRGBColorSpace;
      earthMat.uniforms.dayMap.value = fb;
    });

    // NASA Black Marble: city lights from VIIRS night-time imagery. A fixed 2016 composite because
    // NASA publishes it as an annual product, not a daily one — the lights do not move, and saying
    // so in the footer is cheaper than pretending to a currency the source does not have.
    loader.load(
      "https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2016-01-01"
      + "&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=VIIRS_CityLights_2012"
      + "&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.uniforms.nightMap.value = tex;
        earthMat.uniforms.hasNight.value = 1;
      },
      undefined,
      () => { /* no lights: the night side simply stays dark, which is also true */ }
    );

    // A faint shell that glows at grazing angles — reads as atmosphere and softens the horizon.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.018, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vP;
          void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(-vP)));
            gl_FragColor = vec4(0.35,0.62,1.0, pow(r,2.2) * 0.55); }`,
      })
    );
    scene.add(halo);

    // ── lighting = the terminator ────────────────────────────────────────────
    const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x2a3550, 1.15));   // night side stays legible, not black

    // ── stars ────────────────────────────────────────────────────────────────
    const starN = 1400, starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const t = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), d = 30 + Math.random() * 25;
      starPos[i * 3] = Math.cos(t) * s * d; starPos[i * 3 + 1] = u * d; starPos[i * 3 + 2] = Math.sin(t) * s * d;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaebdd6, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.75 })));

    // ── satellites ───────────────────────────────────────────────────────────
    // One Points cloud for everything. Positions and colours are rewritten in place each frame,
    // so adding a group costs a buffer write rather than new geometry.
    const MAX = 2000;
    const satPos = new Float32Array(MAX * 3);
    const satCol = new Float32Array(MAX * 3);
    const satGeo = new THREE.BufferGeometry();
    satGeo.setAttribute("position", new THREE.BufferAttribute(satPos, 3));
    satGeo.setAttribute("color", new THREE.BufferAttribute(satCol, 3));
    satGeo.setDrawRange(0, 0);
    const satPts = new THREE.Points(satGeo, new THREE.PointsMaterial({
      size: 0.028, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95,
    }));
    scene.add(satPts);

    // A recognisable ISS rather than a dot — truss, modules, arrays, radiators. Built from
    // primitives instead of loading a NASA model: no multi-megabyte download, no CORS dependency,
    // no licence question, and a silhouette is all that reads at this size anyway.
    //
    // GROSSLY out of scale, and deliberately so. The real station is 109m against a 12,742km
    // planet — at true scale it is a fraction of a pixel. The footer says the model is indicative.
    const iss = new THREE.Group();
    {
      const metal = new THREE.MeshPhongMaterial({ color: 0xd8dee8, shininess: 18 });
      const gold  = new THREE.MeshPhongMaterial({ color: 0xc9a227, shininess: 30 });
      const panel = new THREE.MeshPhongMaterial({ color: 0x1b2a55, shininess: 60, emissive: 0x0a1230 });
      const truss = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.005, 0.005), metal);
      iss.add(truss);
      const hab = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.048, 10), gold);
      hab.rotation.x = Math.PI / 2; iss.add(hab);
      const node = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.019, 10), metal);
      node.rotation.z = Math.PI / 2; iss.add(node);
      [-0.048, -0.030, 0.030, 0.048].forEach((x, i) => {
        [-1, 1].forEach((sd) => {
          const a = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0008, 0.039), panel);
          a.position.set(x, 0, sd * 0.027); iss.add(a);
        });
        if (i === 1 || i === 2) {
          const rad = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0006, 0.023), metal);
          rad.position.set(x, 0.009, 0); iss.add(rad);
        }
      });
    }
    iss.visible = false;
    scene.add(iss);
    const issPrev = new THREE.Vector3();
    const issUp = new THREE.Vector3();

    const size = () => {
      const w = host.clientWidth || 600, h = host.clientHeight || 400;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    // ── loop ─────────────────────────────────────────────────────────────────
    // Simulated time advances faster than real time when `speed` > 1. Orbital periods are ~92
    // minutes, so at 1x a satellite crosses a pixel every few seconds — technically live and
    // visually inert. The multiplier is what makes an orbit legible; the badge says so.
    const v = new THREE.Vector3();
    const sunV = new THREE.Vector3();
    const t0 = Date.now();
    const start = performance.now();
    let raf = 0, last = 0, reported = -1;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { on: onNow, speed: spd, satsRef: sref, colors: cols, iss: issPos } = liveRef.current;
      const nowMs = t0 + (performance.now() - start) * spd;
      const when = new Date(nowMs);

      // One sidereal turn per simulated day. At LIVE this is 15 degrees an hour — imperceptible,
      // which is why the decorative auto-rotate stays on there. At 60x a day passes in 24 minutes
      // and at 600x in under three, with the terminator sweeping across real continents because
      // the sun is placed in the same rotating frame.
      spin = ((nowMs / 86400000) % 1) * Math.PI * 2;
      earth.rotation.y = spin;
      halo.rotation.y = spin;

      const s = solar(when);
      toVec(s.lat, s.lon, 26000, sunV);
      sun.position.copy(sunV);
      // The shader needs the same direction the light uses, or the city lights would drift out of
      // step with the terminator — two different night sides on one globe.
      earthMat.uniforms.sunDir.value.copy(sunV).normalize();

      // SGP4 is the expensive part, so it runs at ~10Hz of WALL time regardless of multiplier —
      // the camera and damping still animate every frame, which is what the eye reads as smooth.
      if (performance.now() - last > 100) {
        last = performance.now();
        const gmst = sat.gstime(when);
        let n = 0;
        Object.keys(sref.current || {}).forEach((g) => {
          if (!onNow[g]) return;
          const c = new THREE.Color(cols[g] || "#94A3B8");
          (sref.current[g] || []).forEach((o) => {
            if (n >= MAX) return;
            try {
              const pv = sat.propagate(o.satrec, when);
              if (!pv || !pv.position) return;
              const gd = sat.eciToGeodetic(pv.position, gmst);
              const lat = sat.degreesLat(gd.latitude), lon = sat.degreesLong(gd.longitude);
              const alt = gd.height;
              if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) return;
              toVec(lat, lon, alt, v);
              satPos[n * 3] = v.x; satPos[n * 3 + 1] = v.y; satPos[n * 3 + 2] = v.z;
              satCol[n * 3] = c.r; satCol[n * 3 + 1] = c.g; satCol[n * 3 + 2] = c.b;
              n++;
            } catch { /* one bad element set must not stop the sweep */ }
          });
        });
        // The ISS comes from the LIVE feed, not from the propagated list — SpaceView filters it
        // out of the stations group precisely because it is tracked rather than computed. Placing
        // it here keeps that distinction: one observed object, everything else derived.
        // At an accelerated multiplier the live fix no longer describes the moment on screen, so
        // the marker hides rather than sit somewhere it is not.
        if (issPos && spd === 1) {
          toVec(issPos.lat, issPos.lon, issPos.altKm, v);
          iss.position.copy(v);
          // Fly along the track rather than sit at a fixed angle: nadir points at Earth's centre
          // and the long axis follows the direction of travel, which is roughly how it actually
          // flies. Falls back to the previous frame's heading when the station is stationary.
          issUp.copy(v).normalize();
          if (issPrev.lengthSq() > 0 && !issPrev.equals(v)) {
            const fwd = issPrev.clone().sub(v).normalize().multiplyScalar(-1);
            const m = new THREE.Matrix4();
            const right = new THREE.Vector3().crossVectors(issUp, fwd).normalize();
            const trueFwd = new THREE.Vector3().crossVectors(right, issUp).normalize();
            m.makeBasis(trueFwd, issUp, right);
            iss.quaternion.setFromRotationMatrix(m);
          }
          issPrev.copy(v);
          iss.visible = true;
        }
        else iss.visible = false;
        satGeo.setDrawRange(0, n);
        satGeo.attributes.position.needsUpdate = true;
        satGeo.attributes.color.needsUpdate = true;
        if (n !== reported) { reported = n; if (onCount) onCount(n); }
      }

      // The label is HTML, not scene geometry: text in a 3D scene either faces the wrong way or
      // costs a texture atlas. Project the marker to screen space each frame and move a div.
      // Hidden when the ISS swings behind the globe — a label floating over the far side would
      // point at nothing.
      const lb = labelRef.current;
      if (lb) {
        if (iss.visible) {
          const p = iss.position.clone();
          const toCam = camera.position.clone().sub(p);
          const occluded = p.clone().normalize().dot(toCam.normalize()) < 0;
          p.project(camera);
          const w = host.clientWidth, h = host.clientHeight;
          lb.style.transform = `translate(${(p.x * 0.5 + 0.5) * w + 10}px, ${(-p.y * 0.5 + 0.5) * h - 8}px)`;
          lb.style.opacity = occluded || p.z > 1 ? "0" : "1";
        } else lb.style.opacity = "0";
      }

      controls.autoRotate = spd === 1 && !userActive;
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      ro.disconnect();
      controls.removeEventListener("start", wake);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // Deliberately mounts ONCE: live values are read through liveRef so a toggle or speed change
    // never rebuilds the WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureUrl]);

  return (
    <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none" }}>
      <div ref={labelRef} className="font-mono"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", opacity: 0,
          fontSize: 11, color: "#F472B6", textShadow: "0 0 4px rgba(4,18,31,0.95)",
          transition: "opacity 160ms linear", willChange: "transform" }}>
        ISS
      </div>
      <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 4 }}>
        {[["+", 1 / 1.35, "Zoom in"], ["\u2212", 1.35, "Zoom out"]].map(([sym, f, label]) => (
          <button key={label} aria-label={label} title={label}
            onClick={() => zoomRef.current && zoomRef.current(f)}
            className="rounded font-mono"
            style={{ width: 26, height: 26, fontSize: 15, lineHeight: 1,
              color: "#C9D3E0", background: "rgba(4,18,31,0.72)",
              border: "1px solid rgba(138,148,163,0.35)" }}>
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
}

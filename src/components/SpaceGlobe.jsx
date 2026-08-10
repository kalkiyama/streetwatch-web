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

const R = 1;                       // Earth radius in scene units

// Geodetic to scene coordinates. Y is up, and longitude is offset so the texture's prime meridian
// lands where it should — an equirectangular image starts at -180.
function toVec(latDeg, lonDeg, altKm, out) {
  const lat = (latDeg * Math.PI) / 180;
  // +180 because three.js SphereGeometry begins its texture wrap at phi = 0, which on an
  // equirectangular image is longitude -180, not Greenwich. Without the offset every object —
  // satellites, the ISS, and the sun that lights the terminator — sits exactly half a world
  // away from where it belongs, consistently enough to look deliberate.
  const lon = ((lonDeg + 180) * Math.PI) / 180;
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
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    // Any touch of the globe stops the idle spin; it resumes after a pause so the view never
    // feels like it is fighting the person using it.
    let idle;
    const wake = () => {
      controls.autoRotate = false;
      clearTimeout(idle);
      idle = setTimeout(() => { controls.autoRotate = true; }, 6000);
    };
    controls.addEventListener("start", wake);

    // ── Earth ────────────────────────────────────────────────────────────────
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshPhongMaterial({ color: 0x2b4a6b, shininess: 3 })
    );
    scene.add(earth);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(textureUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      earth.material.map = tex;
      earth.material.color.set(0xffffff);
      earth.material.needsUpdate = true;
    }, undefined, () => { /* keep the plain blue sphere if imagery fails */ });

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

    const issGeo = new THREE.SphereGeometry(0.022, 16, 12);
    const iss = new THREE.Mesh(issGeo, new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    iss.visible = false;
    scene.add(iss);

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

      const s = solar(when);
      toVec(s.lat, s.lon, 26000, sunV);
      sun.position.copy(sunV);

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
        if (issPos && spd === 1) { toVec(issPos.lat, issPos.lon, issPos.altKm, v); iss.position.copy(v); iss.visible = true; }
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
    </div>
  );
}

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ─────────────────────────────────────────────────────────────────────────────
// Attack flows on a sphere.
//
// The flat FlowMap draws these as bezier curves on an equirectangular map, which works but bends
// a great circle into a shape it does not have — a Brazil-to-US arc crosses the map in a way the
// traffic does not cross the planet. On a globe the arc lifts off the surface along the actual
// path, which is both truer and the thing a tester meant when they said the Cyber tab felt
// minimal next to Space.
//
// WHAT THIS DOES NOT CHANGE: the honesty rules the flat map already carries. Domestic flows are a
// RING on the country rather than an arrow, because traffic that starts and ends in one place has
// no direction to draw. A country with no centroid is NOT dropped — it stays in the list and in
// the count beneath. Both rules are ported deliberately; losing them in a projection change would
// be exactly the quiet regression this project keeps catching elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

const R = 1;

// Same convention as SpaceGlobe: +180 because three.js SphereGeometry begins its texture wrap at
// phi = 0, which on an equirectangular image is longitude -180, not Greenwich.
function toVec(latDeg, lonDeg, alt, out) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = ((lonDeg + 180) * Math.PI) / 180;
  const r = R * (1 + alt);
  out.set(
    -r * Math.cos(lat) * Math.cos(lon),
     r * Math.sin(lat),
     r * Math.cos(lat) * Math.sin(lon)
  );
  return out;
}

// A great-circle arc lifted off the surface. Height scales with distance: a neighbouring-country
// flow should hug the ground while an intercontinental one visibly leaves it, or every arc looks
// the same regardless of how far the traffic actually travelled.
function arcPoints(from, to, segments = 48) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  toVec(from[0], from[1], 0, a);
  toVec(to[0], to[1], 0, b);
  const angle = a.angleTo(b);
  const lift = Math.min(0.45, 0.06 + angle * 0.16);
  const pts = [];
  // TRUE spherical interpolation (slerp). The first version lerped between the endpoints and then
  // normalised, which walks the CHORD and projects it outward — points bunch near the ends and
  // stretch through the middle, so the arc reads as an uneven wire rather than a smooth path.
  // Weighting each endpoint by sin() of its share of the angle keeps every step the same size.
  const sinA = Math.sin(angle);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    if (sinA < 1e-6) {
      p.copy(a);                                   // coincident endpoints: nothing to interpolate
    } else {
      const w1 = Math.sin((1 - t) * angle) / sinA;
      const w2 = Math.sin(t * angle) / sinA;
      p.set(a.x * w1 + b.x * w2, a.y * w1 + b.y * w2, a.z * w1 + b.z * w2).normalize();
    }
    const h = Math.sin(Math.PI * t) * lift;
    pts.push(p.clone().multiplyScalar(R * (1 + h)));
  }
  return pts;
}

export default function CyberGlobe({ flows, coords, selected, onSelect, textureUrl }) {
  const hostRef = useRef(null);
  const zoomRef = useRef(null);
  const liveRef = useRef({ flows, coords, selected, onSelect });
  useEffect(() => { liveRef.current = { flows, coords, selected, onSelect }; },
    [flows, coords, selected, onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(0, 1.1, 3.2);

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { return; }                 // no WebGL — the flat map remains available
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;
    controls.minDistance = 1.4;
    controls.maxDistance = 7;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    let idle, userActive = false;
    const wake = () => {
      userActive = true;
      controls.autoRotate = false;
      clearTimeout(idle);
      idle = setTimeout(() => { userActive = false; controls.autoRotate = true; }, 6000);
    };
    controls.addEventListener("start", wake);

    zoomRef.current = (factor) => {
      const d = camera.position.length();
      camera.position.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, d * factor)));
      wake();
      controls.update();
    };

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x16283d })
    );
    scene.add(earth);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    if (textureUrl) {
      loader.load(textureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earth.material.map = tex;
        // Darkened deliberately: this globe is a BACKDROP for the arcs, not the subject. At full
        // brightness the imagery competes with the thing the panel is about.
        earth.material.color.set(0x6f7f92);
        earth.material.needsUpdate = true;
      }, undefined, () => { /* the plain sphere is honest enough as a backdrop */ });
    }

    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.02, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x2a6ea8, transparent: true, opacity: 0.06, side: THREE.BackSide })
    ));

    const arcGroup = new THREE.Group();
    scene.add(arcGroup);

    const size = () => {
      const w = host.clientWidth || 600, h = host.clientHeight || 420;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    let lastKey = "";
    const build = () => {
      const { flows: fl, coords: LL, selected: sel } = liveRef.current;
      if (!fl || !fl.length) return;
      const key = fl.map((f) => `${f.origin}>${f.target}:${f.pct}`).join("|") + `#${sel}`;
      if (key === lastKey) return;
      lastKey = key;

      arcGroup.clear();
      const max = Math.max(0.01, ...fl.map((f) => f.pct));
      const v = new THREE.Vector3();

      fl.forEach((f, i) => {
        const from = LL[f.origin], to = LL[f.target];
        if (!from || !to) return;                 // listed below the globe instead, never silently lost
        const share = f.pct / max;
        const dim = sel != null && sel !== i;
        // Amber, not red. Red reads as an alarm, and these are ordinary filtered requests measured
        // over a day — the colour was making a claim the data does not support. Amber is already
        // this app's colour for "notable, not urgent".
        const colour = new THREE.Color(f.domestic ? 0xc084fc : 0xf6a821);

        if (f.domestic) {
          // A RING, not an arrow. Traffic that begins and ends in the same country has no
          // direction to draw, and drawing one would invent a claim the data does not make.
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.045 + share * 0.03, 0.055 + share * 0.04, 32),
            new THREE.MeshBasicMaterial({ color: colour, transparent: true,
              opacity: dim ? 0.15 : 0.75, side: THREE.DoubleSide, depthWrite: false })
          );
          toVec(from[0], from[1], 0.012, v);
          ring.position.copy(v);
          ring.lookAt(0, 0, 0);
          arcGroup.add(ring);
          return;
        }

        const pts = arcPoints(from, to);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        arcGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: colour, transparent: true, opacity: dim ? 0.12 : 0.35 + share * 0.5,
        })));

        // A dot at the TARGET end only. Both ends marked would make the arc look like a link
        // between equals, when the whole point is that one country is sending and one receiving.
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.012 + share * 0.014, 12, 10),
          new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: dim ? 0.2 : 0.95 })
        );
        dot.position.copy(pts[pts.length - 1]);
        arcGroup.add(dot);
      });
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      build();
      controls.autoRotate = !userActive;
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
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // Mounts once; live values are read through liveRef so a selection never rebuilds the context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureUrl]);

  return (
    <div ref={hostRef} className="absolute inset-0" style={{ touchAction: "none" }}>
      {/* Same buttons as the Space globe. Pinch and scroll already zoom, but neither is
          discoverable — nothing on screen says the globe can be zoomed at all. */}
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

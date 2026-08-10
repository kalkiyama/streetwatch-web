import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Satellite, Globe as GlobeIcon, Map as MapIcon } from "lucide-react";
import * as sat from "satellite.js";
import { C } from "../theme.js";

// three.js is ~150kB gzipped and only the globe needs it, so it is loaded on demand rather than
// riding in the main bundle for everyone who never opens this tab.
const SpaceGlobe = lazy(() => import("./SpaceGlobe.jsx"));

// Colours are per GROUP, not per object: with eight toggles a single colour makes the layer
// meaningless the moment two are on. The chips carry the same colour, so the chips ARE the legend.
// None of them is the ISS pink — the one live-tracked object stays visually unique.
const GROUP_COLOR = {
  stations: "#A78BFA",
  "last-30-days": "#FBBF24",
  "gps-ops": "#38BDF8",
  galileo: "#818CF8",
  weather: "#34D399",
  resource: "#22D3EE",
  geo: "#FB923C",
  starlink: "#94A3B8",
};

// Vercel functions do not run under `vite dev`, so in development the client talks to the deployed
// function instead. The function sends Access-Control-Allow-Origin for exactly this reason.
const API = import.meta.env.DEV ? "https://streetwatch.earth" : "";

const ISS_NORAD = 25544;
const W = 720, H = 360;
const TRAIL_S = [-45, -90, -135];   // seconds behind — three points make a tail that shows heading

// Two basemaps, because they answer different questions.
//
//   BLUE MARBLE is a cloud-free composite: coastlines and terrain are crisp, so you can actually
//   tell which country a satellite is over. That is the point of the globe, so it is the default.
//   LIVE is yesterday's VIIRS true colour — the real sky, clouds and all. Honest and pretty, but
//   half the planet is white, and country outlines vanish underneath.
//
// Yesterday, not today, because GIBS publishes on a lag and an empty tile is worse than a day-old
// one. Resolved at MODULE level: reading the clock during render makes the component non-idempotent.
const BG_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const gibs = (layer, time, w) =>
  `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=${time}`
  + `&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=${layer}`
  + `&FORMAT=image/jpeg&WIDTH=${w}&HEIGHT=${w / 2}`;

// The globe gets a far larger texture than the flat map ever needed: 720px stretched over a sphere
// is soft and blocky at any useful zoom.
const BASEMAPS = {
  marble: { label: "Terrain", flat: gibs("BlueMarble_ShadedRelief_Bathymetry", "2024-01-01", 1024),
            globe: gibs("BlueMarble_ShadedRelief_Bathymetry", "2024-01-01", 2048) },
  live:   { label: "Today", flat: gibs("VIIRS_SNPP_CorrectedReflectance_TrueColor", BG_DATE, 1024),
            globe: gibs("VIIRS_SNPP_CorrectedReflectance_TrueColor", BG_DATE, 2048) },
};

const px = (lon) => ((lon + 180) / 360) * W;
const py = (lat) => ((90 - lat) / 180) * H;

// Solar declination and the subsolar longitude, good to a fraction of a degree — far finer than a
// 720px-wide map can show. Drives both the terminator and the sun marker.
function solar(date) {
  const n = (date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  const L = ((280.46 + 0.9856474 * n) * Math.PI) / 180;
  const lambda = L + ((1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = (23.439 * Math.PI) / 180;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return { decl, subLon: -15 * (utcH - 12), subLat: (decl * 180) / Math.PI };
}

export default function SpaceView() {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [bgErr, setBgErr] = useState(false);
  const liveRef = useRef(false); const everRef = useRef(false);
  const simRef = useRef({ phase: 0, lon: -30 });
  const pink = "#F472B6";

  // The ISS track is DRAWN, so it is state rather than a ref. A null entry is a deliberate break in
  // the polyline where the ground track wraps the antimeridian — without it the line whips across
  // the whole map. Kept to 140 points so the tail fades rather than encircling the globe.
  const [track, setTrack] = useState([]);
  const push = (lat, lon) => setTrack((t) => {
    const p = t[t.length - 1];
    const next = (!p || Math.abs(p[1] - lon) < 60) ? [...t, [lat, lon]] : [...t, null, [lat, lon]];
    return next.length > 140 ? next.slice(next.length - 140) : next;
  });

  // ── satellite layer ────────────────────────────────────────────────────────
  const [groups, setGroups] = useState([]);
  const [on, setOn] = useState({ stations: true });
  const [meta, setMeta] = useState({});        // group -> { total, served, capped, oldestEpochHours }
  const [loading, setLoading] = useState({});  // group -> true while its elements are in flight
  const [count, setCount] = useState(0);       // how many are actually on screen, for the footer
  const [view, setView] = useState("globe");   // globe reads better for orbits; map for whole ground tracks
  // An orbital period is ~92 minutes, which on this scale is a fraction of a pixel per second:
  // technically live and visually inert. The multiplier is what makes an orbit legible, and the
  // badge says plainly when the view has left the present moment.
  const [speed, setSpeed] = useState(60);
  const [base, setBase] = useState("marble");
  // Both control rows and the provenance footer collapse by default. Eight labelled category
  // chips, three speed chips, two basemaps and two view buttons stacked into a block TALLER than
  // the map itself on a phone, and the footer added a second wall of text under it — the subject
  // of the page was the smallest thing on screen. The disclosures are the point of this app, so
  // they are hidden behind a toggle rather than cut.
  const [showLayers, setShowLayers] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const satsRef = useRef({});                  // group -> [{ id, name, satrec }] — never rendered
  // Which groups have a request IN FLIGHT. This has to be a ref, not the `loading` state: the old
  // guard tested satsRef, which stays empty until the fetch resolves, so every re-render that the
  // effect itself caused re-entered and fired the same request again. Starlink lost that race most
  // often because it is the largest payload.
  const inflightRef = useRef({});
  // Bumped when a group's elements land. satsRef is a ref, so nothing else tells the view that new
  // data exists — which is why groups only appeared after toggling speed or switching views.
  const [gen, setGen] = useState(0);
  const canvasRef = useRef(null);

  // Positions live in a ref and are painted to CANVAS, not returned as React elements. 940 SVG
  // circles reconciled once a second made the dots JUMP rather than move; canvas skips React
  // entirely, so the same objects can be redrawn every animation frame for the cost of a fill.
  // Each entry holds the position now (a) and one second ahead (b); the frame loop interpolates
  // between them, which is what turns a 1Hz propagation into 60fps motion.
  const frameRef = useRef({ at: 0, items: [] });

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/space?groups`)
      .then((r) => r.json())
      .then((j) => { if (alive && j && j.groups) setGroups(j.groups); })
      .catch(() => { /* the toggles simply do not appear; the ISS view is unaffected */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const wanted = Object.keys(on).filter((g) => on[g] && !satsRef.current[g] && !inflightRef.current[g]);
    if (!wanted.length) return;
    wanted.forEach((g) => {
      inflightRef.current[g] = true;
      setLoading((s) => ({ ...s, [g]: true }));
      fetch(`${API}/api/space?group=${encodeURIComponent(g)}`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((j) => {
          if (!alive || !j || !j.sats) return;
          satsRef.current[g] = j.sats
            // The ISS is IN the stations group. It is already on screen as a live-tracked marker,
            // so rendering the propagated copy too would show one object twice, slightly apart.
            .filter((s) => s.id !== ISS_NORAD)
            .map((s) => { try { return { id: s.id, name: s.name, satrec: sat.twoline2satrec(s.l1, s.l2) }; } catch { return null; } })
            .filter(Boolean);
          setMeta((m) => ({ ...m, [g]: { total: j.total, served: j.served, capped: j.capped, oldestEpochHours: j.oldestEpochHours } }));
          inflightRef.current[g] = false;
          setLoading((s) => ({ ...s, [g]: false }));
          setGen((n) => n + 1);
        })
        .catch(() => { inflightRef.current[g] = false; if (alive) { satsRef.current[g] = []; setLoading((s) => ({ ...s, [g]: false })); setGen((n) => n + 1); } });
    });
    return () => { alive = false; };
  }, [on]);

  // Propagation tick — once a second, deliberately. SGP4 is the expensive part; the smoothness
  // comes from interpolation in the frame loop below, not from solving more often.
  useEffect(() => {
    const geo = (satrec, when, gmst) => {
      const pv = sat.propagate(satrec, when);
      if (!pv || !pv.position) return null;
      const gd = sat.eciToGeodetic(pv.position, gmst);
      const lat = sat.degreesLat(gd.latitude), lon = sat.degreesLong(gd.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return [px(lon), py(lat)];
    };
    const solve = () => {
      const now = new Date();
      const ahead = new Date(now.getTime() + 1000);
      const g0 = sat.gstime(now), g1 = sat.gstime(ahead);
      const items = [];
      Object.keys(satsRef.current).forEach((g) => {
        if (!on[g]) return;
        const color = GROUP_COLOR[g] || "#8A94A3";
        satsRef.current[g].forEach((s) => {
          try {
            const a = geo(s.satrec, now, g0); if (!a) return;
            const b = geo(s.satrec, ahead, g1) || a;
            // A trail that wraps the antimeridian would draw a line straight across the map, so any
            // segment jumping more than a third of the width is dropped rather than drawn wrong.
            const tail = [];
            for (const dt of TRAIL_S) {
              const when = new Date(now.getTime() + dt * 1000);
              const p = geo(s.satrec, when, sat.gstime(when));
              if (!p) break;
              const prev = tail.length ? tail[tail.length - 1] : a;
              if (Math.abs(p[0] - prev[0]) > W / 3) break;
              tail.push(p);
            }
            items.push({ a, b, tail, color });
          } catch { /* one bad element set must not stop the sweep */ }
        });
      });
      frameRef.current = { at: performance.now(), items };
      setCount(items.length);
    };
    solve();
    const id = setInterval(solve, 1000);
    return () => clearInterval(id);
  }, [on, gen]);

  // Frame loop — interpolates between the last two solved positions and repaints. This is the only
  // thing that runs at display rate; nothing here allocates or touches React state.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current; if (!cv) return;
      const ctx = cv.getContext("2d"); if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ── night side ──────────────────────────────────────────────────────────
      // The terminator is the locus where the sun sits exactly on the horizon: for each longitude,
      // lat = atan(-cos(hourAngle) / tan(declination)). Whichever pole is tilted away is the dark
      // one, so the shading fills toward it. It creeps west all day, which is the point.
      const { decl, subLon, subLat } = solar(new Date());
      if (Math.abs(decl) > 0.001) {
        const northDark = decl < 0;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const lon = (x / W) * 360 - 180;
          const Hh = ((lon - subLon) * Math.PI) / 180;
          const lat = (Math.atan(-Math.cos(Hh) / Math.tan(decl)) * 180) / Math.PI;
          const y = py(lat);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(W, northDark ? 0 : H);
        ctx.lineTo(0, northDark ? 0 : H);
        ctx.closePath();
        ctx.fillStyle = "rgba(4,10,20,0.55)";
        ctx.fill();
        ctx.strokeStyle = "rgba(251,191,36,0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // subsolar point — the spot with the sun directly overhead
      const sx = px(((subLon + 540) % 360) - 180), sy = py(subLat);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 26);
      glow.addColorStop(0, "rgba(251,191,36,0.30)");
      glow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, 6.284); ctx.fill();
      ctx.fillStyle = "rgba(253,224,71,0.9)"; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 6.284); ctx.fill();

      // ── satellites ──────────────────────────────────────────────────────────
      const { at, items } = frameRef.current;
      // Clamped so a backgrounded tab (which throttles timers) resumes cleanly instead of
      // extrapolating a wild distance past the last solved position.
      const f = Math.max(0, Math.min(1, (performance.now() - at) / 1000));
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const x = it.a[0] + (it.b[0] - it.a[0]) * (Math.abs(it.b[0] - it.a[0]) > W / 3 ? 0 : f);
        const y = it.a[1] + (it.b[1] - it.a[1]) * f;
        if (it.tail.length) {
          ctx.strokeStyle = it.color; ctx.lineWidth = 0.9;
          ctx.globalAlpha = 0.45;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (const t of it.tail) ctx.lineTo(t[0], t[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // A dark halo under every dot. Live true-colour imagery is mostly white cloud, and an
        // unhaloed dot disappeared over anything bright — the layer read as empty over half the
        // globe. The ring costs one extra fill and makes the colour legible on any background.
        ctx.fillStyle = "rgba(2,8,16,0.85)";
        ctx.beginPath(); ctx.arc(x, y, 2.9, 0, 6.284); ctx.fill();
        ctx.fillStyle = it.color;
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 6.284); ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const r = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        liveRef.current = true; everRef.current = true; setStatus("live");
        const p = { lat: j.latitude, lon: j.longitude, altKm: j.altitude, velKmh: j.velocity };
        setPos(p); push(p.lat, p.lon);
      } catch { liveRef.current = false; if (!everRef.current) setStatus("sim"); }
    }
    pull();
    const pollId = setInterval(pull, 3000);
    const tickId = setInterval(() => {
      if (!liveRef.current) {
        const st = simRef.current;
        st.phase += (2 * Math.PI) / (92.9 * 60) * 4;      // accelerated for visibility
        st.lon = ((st.lon + 0.9 + 540) % 360) - 180;
        const lat = 51.6 * Math.sin(st.phase);
        setPos({ lat, lon: st.lon, altKm: 420, velKmh: 27600 }); push(lat, st.lon); setStatus("sim");
      }
    }, 1000);
    return () => { alive = false; clearInterval(pollId); clearInterval(tickId); };
  }, []);


  const shownGroups = Object.keys(on).filter((g) => on[g] && meta[g]);
  const oldestEpoch = shownGroups.reduce((a, g) => Math.max(a, meta[g].oldestEpochHours || 0), 0);
  const capNotes = shownGroups.filter((g) => meta[g].capped)
    .map((g) => `${(groups.find((x) => x.group === g) || {}).label || g} ${meta[g].served} of ${meta[g].total.toLocaleString()}`);

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#04121F" }}>
      {/* Category toggles sit ABOVE the map, because a control row below it reads as a footnote:
          the first build put them under the footer text and nobody could tell they were clickable.
          Each chip wears its group's colour so the chips double as the legend — a separate key
          would be one more thing that can drift out of step with the map. */}
      {groups.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2" style={{ flexWrap: "wrap", borderBottom: `1px solid ${C.line}` }}>
          <span className="font-mono" style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 4 }}>SHOW</span>
          <button onClick={() => setShowLayers((v) => !v)} className="rounded font-mono"
            title="Choose which satellite groups to plot"
            style={{ fontSize: 8.5, padding: "3px 6px", color: showLayers ? "#04121F" : C.dim,
              background: showLayers ? C.dim : "transparent", border: `1px solid ${C.line}` }}>
            Layers {Object.keys(on).filter((k) => on[k]).length}{showLayers ? " \u25b4" : " \u25be"}
          </button>
          <span style={{ flex: 1 }} />
          {[["globe", GlobeIcon, "3D globe — orbits look like orbits, and the terminator is real lighting"],
            ["map", MapIcon, "Flat map — better for seeing a whole ground track at once"]].map(([k, Icon, tip]) => (
            <button key={k} onClick={() => setView(k)} className="rounded" title={tip}
              style={{ padding: "3px 5px", color: view === k ? "#04121F" : C.dim,
                background: view === k ? C.dim : "transparent", border: `1px solid ${C.line}` }}>
              <Icon size={11} />
            </button>
          ))}
          {Object.entries(BASEMAPS).map(([k, b]) => (
            <button key={k} onClick={() => setBase(k)} className="rounded font-mono"
              title={k === "marble" ? "Cloud-free composite — coastlines stay visible" : `Real imagery from ${BG_DATE}, clouds and all`}
              style={{ fontSize: 8.5, padding: "3px 6px", color: base === k ? "#04121F" : C.dim,
                background: base === k ? C.dim : "transparent", border: `1px solid ${C.line}` }}>
              {b.label}
            </button>
          ))}
          {view === "globe" && [1, 60, 600].map((x) => (
            <button key={x} onClick={() => setSpeed(x)} className="rounded font-mono"
              title={x === 1 ? "Real time — honest, but an orbit takes 92 minutes" : `${x}x — a full low orbit sweeps past in ${Math.round(92 * 60 / x)}s`}
              style={{ fontSize: 8.5, padding: "3px 6px", color: speed === x ? "#04121F" : C.amber,
                background: speed === x ? C.amber : "transparent", border: `1px solid ${C.amber}66` }}>
              {x === 1 ? "LIVE" : `${x}\u00d7`}
            </button>
          ))}
        </div>
      )}

      {groups.length > 0 && showLayers && (
        <div className="flex items-center gap-1 px-3 pb-2" style={{ flexWrap: "wrap" }}>
          {groups.map((g) => {
            const c = GROUP_COLOR[g.group] || C.faint;
            const active = !!on[g.group];
            return (
              <button key={g.group} onClick={() => setOn((s) => ({ ...s, [g.group]: !s[g.group] }))}
                className="rounded font-mono"
                title={meta[g.group] ? `${meta[g.group].served} shown of ${meta[g.group].total.toLocaleString()} in catalogue` : `Up to ${g.cap} objects`}
                style={{ fontSize: 8.5, padding: "3px 6px", color: active ? "#04121F" : c,
                  background: active ? c : "transparent", border: `1px solid ${c}66`,
                  opacity: loading[g.group] ? 0.5 : 1 }}>
                {g.label}{meta[g.group] && active ? ` ${meta[g.group].served}` : ""}
              </button>
            );
          })}
        </div>
      )}

      <div className="spacemedia relative w-full" style={{ aspectRatio: "2 / 1" }}>
        {view === "globe" ? (
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center font-mono"
            style={{ fontSize: 10, color: C.faint }}>loading globe…</div>}>
            <SpaceGlobe on={on} satsRef={satsRef} colors={GROUP_COLOR} iss={pos}
              textureUrl={BASEMAPS[base].globe} speed={speed} onCount={setCount} />
          </Suspense>
        ) : (<>
        {!bgErr && <img src={BASEMAPS[base].flat} alt="" onError={() => setBgErr(true)} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover", opacity: 0.5 }} />}
        {/* Canvas carries everything that moves every frame — night shading, sun, satellites and
            their trails. The SVG above it keeps only the handful of elements React should own. */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", position: "relative" }}>
          {bgErr && <rect x="0" y="0" width={W} height={H} fill="#08131F" />}
          {[-60, -30, 0, 30, 60].map((la) => <line key={la} x1="0" y1={py(la)} x2={W} y2={py(la)} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
          {[-120, -60, 0, 60, 120].map((lo) => <line key={lo} x1={px(lo)} y1="0" x2={px(lo)} y2={H} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
          {track.map((p, i) => p && track[i - 1] ? (
            <line key={i} x1={px(track[i - 1][1])} y1={py(track[i - 1][0])} x2={px(p[1])} y2={py(p[0])} stroke={pink} strokeWidth="1.4" opacity="0.5" />
          ) : null)}
          {pos && (
            <g transform={`translate(${px(pos.lon)} ${py(pos.lat)})`}>
              <circle r="10" fill="none" stroke={pink} strokeWidth="1" className="rblip" />
              <circle r="4" fill={pink} stroke="#04121F" strokeWidth="1" />
              <text x="10" y="-8" fill={pink} fontSize="11" fontFamily="monospace">ISS</text>
            </g>
          )}
        </svg>
        </>)}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2" style={{ background: "linear-gradient(180deg, rgba(4,18,31,0.85), rgba(4,18,31,0))" }}>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono" style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : "rgba(246,168,33,0.16)", color: status === "live" ? "#37C46A" : C.amber }}>
            <Satellite size={12} />{view === "globe" && speed > 1
              ? `TIME ×${speed} · PROJECTED`
              : status === "live" ? "LIVE · ISS" : status === "connecting" ? "CONNECTING" : "SIM · ISS"}
          </span>
          <span className="font-mono" style={{ fontSize: 10, color: C.faint }}>wheretheiss.at · NASA GIBS</span>
        </div>
        {pos && !(view === "globe" && speed > 1) && (
          <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 gap-2 px-3 py-2 font-mono" style={{ background: "linear-gradient(0deg, rgba(4,18,31,0.92), rgba(4,18,31,0))", fontSize: 11 }}>
            {[["LAT", pos.lat.toFixed(2) + "°"], ["LON", pos.lon.toFixed(2) + "°"], ["ALT", Math.round(pos.altKm) + " km"], ["VEL", Math.round(pos.velKmh).toLocaleString() + " km/h"]].map(([k, v]) => (
              <div key={k}><div style={{ color: C.faint, fontSize: 9 }}>{k}</div><div style={{ color: pink }}>{v}</div></div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, lineHeight: 1.5, background: "rgba(4,18,31,0.6)" }}>
        <div className="flex items-center justify-between gap-2">
          <span>
            {count > 0
              ? `${count.toLocaleString()} satellites \u00b7 computed from orbital elements, not observed`
              : "ISS tracked live \u00b7 other objects computed from orbital elements"}
            {oldestEpoch > 0 ? ` \u00b7 elements up to ${Math.round(oldestEpoch)}h old` : ""}
          </span>
          <button onClick={() => setShowWhy((v) => !v)} className="rounded"
            style={{ fontSize: 9, padding: "1px 5px", color: C.dim, border: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>
            {showWhy ? "Less" : "Why?"}
          </button>
        </div>
        {showWhy && (
        <div style={{ marginTop: 6 }}>
        ISS position from public NORAD orbital elements via wheretheiss.at (a third-party service,
        not verified by StreetWatch). The orbit is inclined ~51.6° to the equator, so the ground
        track sweeps between about 51.6°N and 51.6°S — it does not follow the equator. Basemap is
        NASA {BASEMAPS[base].label} imagery; the shaded half is night, and the line across it is
        the day/night terminator at this moment.
        {count > 0 && (
          <>
            {" "}The {count.toLocaleString()} coloured dots are COMPUTED, not observed: their
            positions are propagated from CelesTrak orbital elements rather than broadcast by the
            satellites themselves, unlike the aircraft and vessels elsewhere in this app. Trails
            show roughly two minutes of travel.
            {view === "globe" && " On the globe, orbit heights are compressed so that low orbits and \
geostationary satellites 35,786km up fit the same view — higher is still higher, but the spacing is not \
to scale, and the ISS model is indicative rather than a true likeness."}
            {oldestEpoch > 0 && ` Oldest element set on screen is ${Math.round(oldestEpoch)}h old — accuracy degrades as that number grows.`}
            {capNotes.length > 0 && ` Showing a capped subset: ${capNotes.join("; ")}.`}
          </>
        )}
        </div>
        )}
      </div>
    </div>
  );
}

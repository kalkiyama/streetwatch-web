import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { C } from "../theme.js";
import { AIS_BACKEND_URL } from "../config.js";
import { RAD, rnd } from "../geo.js";

const SHIP_PFX = ["MSC","MAERSK","EVER","NORDIC","BALTIC","AURORA","FINNLINES","TALLINK","STENA","HAPAG","ONE","WALLENIUS"];
const SHIP_NM = ["STAR","SPIRIT","VOYAGER","TRADER","EXPRESS","PIONEER","HORIZON","GALAXY","BOTNIA","EUROPA"];
const shipColor = (v) => (v.sogKt == null || v.sogKt < 0.5) ? "#6B7280" : v.sogKt < 7 ? "#2DD4BF" : C.cyan;
function seedSimShips(clat, clon, radiusNm, n = 16) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const ang = rnd(0, 2 * Math.PI), dist = Math.sqrt(Math.random()) * radiusNm * 0.95, cog = rnd(0, 360);
    const moored = Math.random() < 0.35;
    out["s" + i] = {
      id: "s" + i, name: SHIP_PFX[(Math.random() * SHIP_PFX.length) | 0] + " " + SHIP_NM[(Math.random() * SHIP_NM.length) | 0],
      typeCode: 70, lat: clat + (dist * Math.cos(ang)) / 60, lon: clon + (dist * Math.sin(ang)) / (60 * Math.cos(clat * RAD)),
      cogDeg: cog, headingDeg: moored ? null : cog, sogKt: moored ? 0 : rnd(4, 18), navStatus: moored ? 5 : 0,
    };
  }
  return out;
}

// Embedded AIS radar centered on the selected port/harbour.
export default function MarineRadar({ center }) {
  const [status, setStatus] = useState("sim");
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  const [radius, setRadius] = useState(40);
  const acRef = useRef({}); const lastRef = useRef(Date.now()); const liveRef = useRef(false); const failRef = useRef(0);

  useEffect(() => {
    acRef.current = seedSimShips(center.lat, center.lng, radius); lastRef.current = Date.now(); setSel(null); failRef.current = 0;
    let alive = true;
    async function poll() {
      if (!AIS_BACKEND_URL) { setStatus("sim"); liveRef.current = false; return; }
      try {
        const ctl = AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined;
        const r = await fetch(`${AIS_BACKEND_URL}/api/vessels?lat=${center.lat}&lon=${center.lng}&radius=${radius}`, { signal: ctl });
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        const inc = (j.vessels || []).filter((v) => typeof v.lat === "number");
        { const seen = Date.now(); const prev = acRef.current, merged = {};
          Object.values(prev).forEach((o) => { if (seen - (o.seenAt || 0) < 45000) merged[o.id] = o; }); // grace: AIS reports are sparse
          inc.forEach((v) => { const o = prev[v.id]; merged[v.id] = { ...v, seenAt: seen, tLat: v.lat, tLon: v.lon, lat: o ? o.lat : v.lat, lon: o ? o.lon : v.lon }; });
          acRef.current = merged; }
        liveRef.current = true; failRef.current = 0; setStatus("live");
      } catch {
        if (!alive) return;
        failRef.current += 1;
        if (failRef.current >= 3) { liveRef.current = false; setStatus("error"); }
        else if (!liveRef.current) setStatus("connecting");
      }
    }
    poll();
    const pollId = AIS_BACKEND_URL ? setInterval(poll, 6000) : null;
    const tickId = setInterval(() => {
      const now = Date.now(), dt = (now - lastRef.current) / 1000; lastRef.current = now;
      Object.values(acRef.current).forEach((v) => {
        if (liveRef.current) {
          if (v.tLat != null) { v.lat += (v.tLat - v.lat) * 0.15; v.lon += (v.tLon - v.lon) * 0.15; }
          return;
        }
        if (!v.sogKt || v.sogKt < 0.5) return;
        const dir = (v.headingDeg != null ? v.headingDeg : v.cogDeg) || 0;
        const dNm = (v.sogKt * dt) / 3600;
        v.lat += (dNm * Math.cos(dir * RAD)) / 60;
        v.lon += (dNm * Math.sin(dir * RAD)) / (60 * Math.cos(center.lat * RAD));
        const dx = (v.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (v.lat - center.lat) * 60;
        if (Math.hypot(dx, dy) > radius * 1.1) {
          const ang = rnd(0, 2 * Math.PI);
          v.lat = center.lat + (radius * 0.9 * Math.cos(ang)) / 60;
          v.lon = center.lng + (radius * 0.9 * Math.sin(ang)) / (60 * Math.cos(center.lat * RAD));
          v.cogDeg = (ang / RAD + 180) % 360; v.headingDeg = v.cogDeg;
        }
      });
      setTick((t) => t + 1);
    }, 250);
    return () => { alive = false; if (pollId) clearInterval(pollId); clearInterval(tickId); };
  }, [center.lat, center.lng, radius]); // primitives only — object identity changes every render

  const R = 180, cx = 200, cy = 200, teal = "#2DD4BF";
  const plotted = Object.values(acRef.current).map((v) => {
    const dx = (v.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (v.lat - center.lat) * 60;
    const d = Math.hypot(dx, dy);
    return { ...v, d, x: cx + (dx / radius) * R, y: cy - (dy / radius) * R };
  }).filter((v) => v.d <= radius).sort((a, b) => a.d - b.d);
  const chosen = plotted.find((v) => v.id === sel);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#08130F" }}>
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(8,19,15,0.9), rgba(8,19,15,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
          style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : status === "error" ? "rgba(240,85,59,0.16)" : "rgba(246,168,33,0.16)",
            color: status === "live" ? "#37C46A" : status === "error" ? "#F0553B" : C.amber }}>
          {status === "live" ? <Wifi size={12} /> : <WifiOff size={12} />}{status === "live" ? "LIVE" : status === "error" ? "PROXY DOWN" : "SIM"}
        </span>
        <div className="flex items-center gap-1">
          {[20, 50, 100].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? teal : "rgba(20,28,25,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 400 400" className="w-full" style={{ display: "block", maxHeight: 420 }}>
        <defs>
          <radialGradient id="scm" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0C1A16" /><stop offset="100%" stopColor="#07110D" /></radialGradient>
          <linearGradient id="swm" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(45,212,191,0)" /><stop offset="100%" stopColor="rgba(45,212,191,0.26)" /></linearGradient>
        </defs>
        <circle cx="200" cy="200" r="182" fill="url(#scm)" stroke={C.line} />
        {[0.33, 0.66, 1].map((f, i) => <circle key={i} cx="200" cy="200" r={180 * f} fill="none" stroke={C.line} strokeDasharray="2 4" />)}
        {[0.33, 0.66, 1].map((f, i) => <text key={i} x="204" y={200 - 180 * f + 12} fill={C.faint} fontSize="9" fontFamily="monospace">{Math.round(radius * f)}nm</text>)}
        <line x1="200" y1="22" x2="200" y2="378" stroke={C.line} /><line x1="22" y1="200" x2="378" y2="200" stroke={C.line} />
        {[["N", 200, 32], ["E", 372, 204], ["S", 200, 376], ["W", 26, 204]].map(([d, x, y]) => <text key={d} x={x} y={y} fill={C.dim} fontSize="11" fontFamily="monospace" textAnchor="middle">{d}</text>)}
        {!reduce && status !== "error" && <g className="rsweep"><polygon points="200,200 200,24 258,42" fill="url(#swm)" /></g>}
        {plotted.map((v) => {
          const col = shipColor(v), isSel = v.id === sel, moving = v.sogKt != null && v.sogKt >= 0.5;
          const dir = (v.headingDeg != null ? v.headingDeg : v.cogDeg) || 0;
          return (
            <g key={v.id} transform={`translate(${v.x} ${v.y})`} onClick={() => setSel(v.id)} style={{ cursor: "pointer" }}>
              {isSel && <circle r="11" fill="none" stroke={col} strokeWidth="1" />}
              {moving
                ? <g transform={`rotate(${dir})`}><polygon className={isSel ? "" : "rblip"} points="0,-7 3,-1 2.5,6 -2.5,6 -3,-1" fill={col} stroke="#08130F" strokeWidth="0.5" /></g>
                : <rect className={isSel ? "" : "rblip"} x="-3" y="-3" width="6" height="6" fill={col} stroke="#08130F" strokeWidth="0.5" transform="rotate(45)" />}
              {isSel && <text x="10" y="3" fill={col} fontSize="9" fontFamily="monospace">{v.name || v.id}</text>}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="3" fill={teal} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono"
        style={{ background: "linear-gradient(0deg, rgba(8,19,15,0.92), rgba(8,19,15,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: shipColor(chosen) }}>{chosen.name || chosen.id} · {chosen.sogKt != null ? chosen.sogKt.toFixed(1) + "kt" : "—"} · {chosen.cogDeg != null ? Math.round(chosen.cogDeg) + "°" : "moored"}</span>
        ) : status === "live" && plotted.length === 0 ? (
          <span style={{ color: C.faint }}>0 in range — no community AIS receivers near here yet · coverage varies by region</span>
        ) : (<span style={{ color: C.faint }}>Tap a vessel · {plotted.length} in range</span>)}
        <span style={{ color: C.dim }}>{center.city}</span>
      </div>
    </div>
  );
}

// ---- Earth / weather — real NASA satellite imagery (no backend, CORS-free img). ----

import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, X } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL, AIS_BACKEND_URL } from "../config.js";
import { RAD, rnd } from "../geo.js";

const altColor = (a) => a.onGround ? "#6B7280" : a.altFt == null ? C.dim
  : a.altFt < 10000 ? C.amber : a.altFt < 25000 ? C.cyan : a.altFt < 35000 ? "#A78BFA" : "#E8EAED";
const PFX = ["BAW","UAL","DLH","UAE","AIC","JAL","QFA","AFR","KLM","SIA","THY","QTR","ANA","CPA","AAL","SWR"];
const ACT = ["A320","B738","A21N","B77W","A35K","B789","A388","E190","B38M","A333"];
function seedSim(clat, clon, radiusNm, n = 14) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const ang = rnd(0, 2 * Math.PI), dist = Math.sqrt(Math.random()) * radiusNm * 0.95;
    const g = Math.random() < 0.1;
    out["sim" + i] = {
      id: "sim" + i, callsign: PFX[(Math.random() * PFX.length) | 0] + ((100 + Math.random() * 899) | 0),
      typeCode: ACT[(Math.random() * ACT.length) | 0],
      lat: clat + (dist * Math.cos(ang)) / 60, lon: clon + (dist * Math.sin(ang)) / (60 * Math.cos(clat * RAD)),
      headingDeg: rnd(0, 360), groundSpeedKt: g ? rnd(8, 25) : rnd(280, 500),
      altFt: g ? 0 : Math.round(rnd(3, 40)) * 1000, onGround: g,
    };
  }
  return out;
}

// Embedded ADS-B radar centered on the selected airport.
export default function AviationRadar({ center, initialRadius, onRadius }) {
  const [status, setStatus] = useState("sim");
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  const [uavInfo, setUavInfo] = useState(false);
  const [radius, setRadius] = useState([60, 120, 250].includes(initialRadius) ? initialRadius : 100);
  useEffect(() => { if (onRadius) onRadius(radius); }, [radius, onRadius]);
  const acRef = useRef({}); const lastRef = useRef(Date.now()); const liveRef = useRef(false); const failRef = useRef(0);

  useEffect(() => {
    acRef.current = seedSim(center.lat, center.lng, radius); lastRef.current = Date.now(); setSel(null); failRef.current = 0;
    let alive = true;
    async function poll() {
      if (!BACKEND_URL) { setStatus("sim"); liveRef.current = false; return; }
      try {
        const ctl = AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined;
        const r = await fetch(`${BACKEND_URL}/api/aircraft?lat=${center.lat}&lon=${center.lng}&radius=${radius}`, { signal: ctl });
        if (!r.ok) throw new Error();
        const j = await r.json(); if (!alive) return;
        const inc = (j.aircraft || []).filter((a) => a.headingDeg != null && a.groundSpeedKt != null);
        { const seen = Date.now(); const prev = acRef.current, merged = {};
          Object.values(prev).forEach((o) => { if (seen - (o.seenAt || 0) < 15000) merged[o.id] = o; }); // grace: ride through missed polls
          inc.forEach((a) => { const o = prev[a.id]; merged[a.id] = { ...a, seenAt: seen, tLat: a.lat, tLon: a.lon, lat: o ? o.lat : a.lat, lon: o ? o.lon : a.lon, trail: (o && o.trail) || [] }; });
          acRef.current = merged; }
        liveRef.current = true; failRef.current = 0; setStatus("live");
      } catch {
        if (!alive) return;
        failRef.current += 1;
        if (!BACKEND_URL) { setStatus("sim"); liveRef.current = false; }
        else if (failRef.current >= 3) { liveRef.current = false; setStatus("error"); }  // tolerate cold-start hiccups
        else if (!liveRef.current) setStatus("connecting");
      }
    }
    poll();
    const pollId = BACKEND_URL ? setInterval(poll, 5000) : null;
    const tickId = setInterval(() => {
      const now = Date.now(), dt = (now - lastRef.current) / 1000; lastRef.current = now;
      Object.values(acRef.current).forEach((a) => {
        a.tn = (a.tn || 0) + 1;
        // Drones loiter for hours — keep a much longer track for them than for airliners.
        if (a.tn % 8 === 0) { const t = a.trail || (a.trail = []); t.push([a.lat, a.lon]); if (t.length > (a.isDrone ? 450 : 45)) t.shift(); }
        if (liveRef.current) {
          if (a.tLat != null) { a.lat += (a.tLat - a.lat) * 0.15; a.lon += (a.tLon - a.lon) * 0.15; }
          return;
        }
        if (a.onGround || !a.groundSpeedKt) return;
        const dNm = (a.groundSpeedKt * dt) / 3600;
        a.lat += (dNm * Math.cos(a.headingDeg * RAD)) / 60;
        a.lon += (dNm * Math.sin(a.headingDeg * RAD)) / (60 * Math.cos(center.lat * RAD));
        const dx = (a.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (a.lat - center.lat) * 60;
        if (Math.hypot(dx, dy) > radius * 1.1) {
          const ang = rnd(0, 2 * Math.PI);
          a.lat = center.lat + (radius * 0.9 * Math.cos(ang)) / 60;
          a.lon = center.lng + (radius * 0.9 * Math.sin(ang)) / (60 * Math.cos(center.lat * RAD));
          a.headingDeg = (ang / RAD + 180) % 360;
        }
      });
      setTick((t) => t + 1);
    }, 250);
    return () => { alive = false; if (pollId) clearInterval(pollId); clearInterval(tickId); };
  }, [center.lat, center.lng, radius]); // primitives only — object identity changes every render

  const R = 180, cx = 200, cy = 200;
  const plotted = Object.values(acRef.current).map((a) => {
    const dx = (a.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (a.lat - center.lat) * 60;
    const d = Math.hypot(dx, dy);
    const x = cx + (dx / radius) * R, y = cy - (dy / radius) * R;
    const trail = (a.trail || []).map(([la, lo]) => [
      cx + (((lo - center.lng) * Math.cos(center.lat * RAD) * 60) / radius) * R,
      cy - (((la - center.lat) * 60) / radius) * R,
    ]);
    return { ...a, d, x, y, trail };
  }).filter((a) => a.d <= radius).sort((a, b) => a.d - b.d);
  const chosen = plotted.find((a) => a.id === sel);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#0A0E14" }}>
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,14,20,0.9), rgba(10,14,20,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
          style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : status === "error" ? "rgba(240,85,59,0.16)" : "rgba(246,168,33,0.16)",
            color: status === "live" ? "#37C46A" : status === "error" ? "#F0553B" : C.amber }}>
          {status === "live" ? <Wifi size={12} /> : <WifiOff size={12} />}{status === "live" ? "LIVE" : status === "error" ? "PROXY DOWN" : "SIM"}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setUavInfo((v) => !v)} className="px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
            title="About UAV tracking"
            style={{ fontSize: 10, color: uavInfo ? "#0A0E14" : "#C084FC", background: uavInfo ? "#C084FC" : "rgba(192,132,252,0.14)", border: "1px solid rgba(192,132,252,0.4)" }}>
            ◇ UAV{(() => { const d = plotted.filter((a) => a.isDrone).length; return d ? ` ${d}` : ""; })()}
          </button>
          {[60, 120, 250].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? C.cyan : "rgba(28,32,41,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
      {uavInfo && (
        <div className="absolute z-20 left-3 right-3 top-11 rounded-lg p-3"
          style={{ background: "rgba(10,14,20,0.96)", border: "1px solid rgba(192,132,252,0.4)" }}>
          <div className="font-mono flex items-center justify-between" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1 }}>
            <span>◇ UAV TRACKING — HOW IT WORKS</span>
            <button onClick={() => setUavInfo(false)} aria-label="close" style={{ color: "#C084FC" }}><X size={13} /></button>
          </div>
          <div className="mt-1.5" style={{ fontSize: 12, color: C.text, lineHeight: 1.55 }}>
            Drones broadcasting ADS-B category <b>B6</b> (large military, government, and test
            platforms) appear here as violet quad-rotor marks — live, real aircraft.
          </div>
          <div className="mt-1.5" style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
            <b style={{ color: C.text }}>Most radars show 0 UAVs most of the time — that's accurate, not a fault.</b>{" "}
            Small consumer drones use short-range Remote ID and can't be tracked globally.
          </div>
          <div className="mt-1.5" style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>
            <b style={{ color: "#C084FC" }}>Best odds:</b> US Southwest test ranges — try the{" "}
            <b style={{ color: C.text }}>Phoenix, Las-Vegas-area, or Southern California</b> radars at 250nm —
            plus borders and conflict-adjacent airspace.
          </div>
        </div>
      )}
      <svg viewBox="0 0 400 400" className="w-full" style={{ display: "block", maxHeight: 420 }}>
        <defs>
          <radialGradient id="sc" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0F1620" /><stop offset="100%" stopColor="#090D12" /></radialGradient>
          <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(90,200,250,0)" /><stop offset="100%" stopColor="rgba(90,200,250,0.28)" /></linearGradient>
        </defs>
        <circle cx="200" cy="200" r="182" fill="url(#sc)" stroke={C.line} />
        {[0.33, 0.66, 1].map((f, i) => <circle key={i} cx="200" cy="200" r={180 * f} fill="none" stroke={C.line} strokeDasharray="2 4" />)}
        {[0.33, 0.66, 1].map((f, i) => <text key={i} x="204" y={200 - 180 * f + 12} fill={C.faint} fontSize="9" fontFamily="monospace">{Math.round(radius * f)}nm</text>)}
        <line x1="200" y1="22" x2="200" y2="378" stroke={C.line} /><line x1="22" y1="200" x2="378" y2="200" stroke={C.line} />
        {[["N",200,32],["E",372,204],["S",200,376],["W",26,204]].map(([d, x, y]) => <text key={d} x={x} y={y} fill={C.dim} fontSize="11" fontFamily="monospace" textAnchor="middle">{d}</text>)}
        {!reduce && status !== "error" && <g className="rsweep"><polygon points="200,200 200,24 258,42" fill="url(#sw)" /></g>}
        {plotted.map((a) => {
          const col = a.isDrone ? "#C084FC" : altColor(a), isSel = a.id === sel;
          return (
            <g key={a.id} transform={`translate(${a.x} ${a.y})`} onClick={() => setSel(a.id)} style={{ cursor: "pointer" }}>
              {(isSel || a.isDrone) && a.trail.length > 1 && (
                <polyline points={a.trail.map((p) => `${p[0] - a.x},${p[1] - a.y}`).join(" ")}
                  fill="none" stroke={col} strokeWidth="1.2" strokeOpacity="0.45" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {isSel && <circle r="11" fill="none" stroke={col} strokeWidth="1" />}
              {a.isDrone ? (
                <g className={isSel ? "" : "rblip"}>
                  <circle r="4.5" fill="none" stroke={col} strokeWidth="1.4" />
                  <circle cx="-4.5" cy="-4.5" r="1.7" fill={col} /><circle cx="4.5" cy="-4.5" r="1.7" fill={col} />
                  <circle cx="-4.5" cy="4.5" r="1.7" fill={col} /><circle cx="4.5" cy="4.5" r="1.7" fill={col} />
                </g>
              ) : (
                <g transform={`rotate(${a.headingDeg || 0})`}><polygon className={isSel ? "" : "rblip"} points="0,-6 4,5 0,2.5 -4,5" fill={col} stroke="#0A0E14" strokeWidth="0.5" /></g>
              )}
              {isSel && <text x="10" y="3" fill={col} fontSize="9" fontFamily="monospace">{a.callsign || a.id}</text>}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="3" fill={C.cyan} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono"
        style={{ background: "linear-gradient(0deg, rgba(10,14,20,0.92), rgba(10,14,20,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: chosen.isDrone ? "#C084FC" : altColor(chosen) }}>{chosen.isDrone ? "◇ UAV · " : ""}{chosen.callsign || chosen.id} · {chosen.typeCode || "—"} · {chosen.onGround ? "GND" : (chosen.altFt / 1000).toFixed(0) + "k ft"} · {chosen.groundSpeedKt}kt · {Math.round(chosen.headingDeg)}°</span>
        ) : status === "live" && plotted.length === 0 ? (
          <span style={{ color: C.faint }}>0 in range — thin ADS-B receiver coverage here · real data, sparse net</span>
        ) : (<span style={{ color: C.faint }}>Tap an aircraft · {plotted.length} in range{(() => { const d = plotted.filter((a) => a.isDrone).length; return d ? ` · ${d} UAV` : ""; })()}</span>)}
        <span style={{ color: C.dim }}>{center.name.split("·").pop().trim() || center.city}</span>
      </div>
    </div>
  );
}

// ---- Marine (AIS) — set AIS_BACKEND_URL to your deployed ais-proxy.js. ----

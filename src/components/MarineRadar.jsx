import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { C } from "../theme.js";
import RadarMap from "./RadarMap.jsx";
import { AIS_BACKEND_URL } from "../config.js";
import { RAD, rnd } from "../geo.js";

const SHIP_PFX = ["MSC","MAERSK","EVER","NORDIC","BALTIC","AURORA","FINNLINES","TALLINK","STENA","HAPAG","ONE","WALLENIUS"];
const SHIP_NM = ["STAR","SPIRIT","VOYAGER","TRADER","EXPRESS","PIONEER","HORIZON","GALAXY","BOTNIA","EUROPA"];
// Classified kinds override the speed palette — a sub-support tender must not look like
// any other coaster, or the ALL/SEA DRONES/SUB SUPPORT filter reveals nothing you could
// not already see.
const shipColor = (v) =>
  v.subSupport ? "#F0553B"                                    // red: submarine support (surface ship)
  : v.usv ? "#C084FC"                                         // violet: sea drone / candidate
  : (v.sogKt == null || v.sogKt < 0.5) ? "#6B7280" : v.sogKt < 7 ? "#2DD4BF" : C.cyan;
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
// Track length of a trail in nautical miles (flat-earth approx — fine at radar scale).
function trackNm(trail, lat0) {
  let d = 0;
  for (let i = 1; i < trail.length; i++) {
    const dy = (trail[i][0] - trail[i - 1][0]) * 60;
    const dx = (trail[i][1] - trail[i - 1][1]) * 60 * Math.cos(lat0 * Math.PI / 180);
    d += Math.hypot(dx, dy);
  }
  return d;
}
// AIS ship-type and navigational-status codes → plain words.
function shipTypeLabel(t) {
  if (t == null) return null;
  if (t === 30) return "Fishing"; if (t === 31 || t === 32) return "Towing";
  if (t === 33) return "Dredging"; if (t === 34) return "Diving";
  if (t === 35) return "Military ops"; if (t === 36) return "Sailing"; if (t === 37) return "Pleasure craft";
  if (t === 50) return "Pilot"; if (t === 51) return "Search & rescue"; if (t === 52) return "Tug";
  if (t === 53) return "Port tender"; if (t === 55) return "Law enforcement";
  if (t >= 40 && t < 50) return "High-speed craft";
  if (t >= 60 && t < 70) return "Passenger";
  if (t >= 70 && t < 80) return "Cargo";
  if (t >= 80 && t < 90) return "Tanker";
  if (t >= 90) return "Other";
  return null;
}
function navStatusLabel(s) {
  const m = { 0: "under way (engine)", 1: "at anchor", 2: "not under command", 3: "restricted manoeuvrability",
    4: "constrained by draught", 5: "moored", 6: "aground", 7: "fishing", 8: "under way (sailing)", 11: "towing astern",
    12: "pushing ahead", 14: "AIS-SART" };
  return m[s] || null;
}
function bearingOf(o, c) {
  const dy = o.lat - c.lat, dx = (o.lon - c.lng) * Math.cos(c.lat * Math.PI / 180);
  return String(Math.round((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360).padStart(3, "0");
}
export default function MarineRadar({ center, initialRadius, onRadius, initialSel, initialSelLabel = null, initialSelSeen = null, onSelect }) {
  const [status, setStatus] = useState("sim");
  const [upstream, setUpstream] = useState("live");   // "live" | "down" (provider outage)
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  // A tap-to-open vessel must actually be inside the ring, or the preselect polls for a
  // vessel the radar never loads. The map routes taps only within 100nm, so the widest
  // ring guarantees visibility. (This was the bug: default 40nm, vessel at 60nm, nothing
  // ever selected and no hint why.)
  const [radius, setRadius] = useState(
    initialSel ? 100 : [20, 50, 100].includes(initialRadius) ? initialRadius : 40);
  const [view, setView] = useState("radar");   // radar | map
  const [only, setOnly] = useState("all");     // all | usv | sub
  useEffect(() => { if (onRadius) onRadius(radius); }, [radius, onRadius]);
  useEffect(() => { if (onSelect) onSelect(sel); }, [sel, onSelect]);
  const wantSel = useRef(initialSel || null);
  // A miss must be said out loud (same fix as the aviation radar): a vessel from the list may
  // have sailed out of AIS coverage or beyond this ring — polling silently for 45s and giving
  // up left the user watching a radar that never explained why nothing highlighted.
  const [selMissing, setSelMissing] = useState(null);
  useEffect(() => {
    if (!wantSel.current) return;
    const id = setInterval(() => {
      if (acRef.current[wantSel.current]) {
        setSel(wantSel.current); setSelMissing(null); wantSel.current = null; clearInterval(id);
      }
    }, 1000);
    const stop = setTimeout(() => {
      clearInterval(id);
      if (wantSel.current) { setSelMissing(wantSel.current); wantSel.current = null; }
    }, 15000);                                   // vessels refresh slower than aircraft
    return () => { clearInterval(id); clearTimeout(stop); };
  }, []);
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
        if (j.upstream) setUpstream(j.upstream);
        const inc = (j.vessels || []).filter((v) => typeof v.lat === "number");
        { const seen = Date.now(); const prev = acRef.current, merged = {};
          Object.values(prev).forEach((o) => { if (seen - (o.seenAt || 0) < 45000) merged[o.id] = o; }); // grace: AIS reports are sparse
          inc.forEach((v) => { const o = prev[v.id]; merged[v.id] = { ...v, seenAt: seen, tLat: v.lat, tLon: v.lon, lat: o ? o.lat : v.lat, lon: o ? o.lon : v.lon, trail: (o && o.trail) || [] }; });
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
        v.tn = (v.tn || 0) + 1;
        // Ships are slow: a 90s trail is sub-pixel. Sample every 5s, keep ~25 min of track.
        if (v.tn % 20 === 0) { const t = v.trail || (v.trail = []); t.push([v.lat, v.lon]); if (t.length > 300) t.shift(); }
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
    const x = cx + (dx / radius) * R, y = cy - (dy / radius) * R;
    const trail = (v.trail || []).map(([la, lo]) => [
      cx + (((lo - center.lng) * Math.cos(center.lat * RAD) * 60) / radius) * R,
      cy - (((la - center.lat) * 60) / radius) * R,
    ]);
    return { ...v, d, x, y, trail };
  }).filter((v) => v.d <= radius).sort((a, b) => a.d - b.d);
  // ALL / SEA DRONES / SUB SUPPORT — same pattern as the aviation radar's ALL/MIL/UAV.
  // The filter narrows what is DRAWN; `plotted` stays whole so counts and the chosen
  // vessel's details never vanish underneath the user.
  const shown = only === "usv" ? plotted.filter((v) => v.usv)
              : only === "sub" ? plotted.filter((v) => v.subSupport)
              : plotted;
  const chosen = plotted.find((v) => v.id === sel);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#08130F" }}>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ zIndex: 1200, background: "linear-gradient(180deg, rgba(8,19,15,0.9), rgba(8,19,15,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono"
          style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : status === "error" ? "rgba(240,85,59,0.16)" : "rgba(246,168,33,0.16)",
            color: status === "live" ? "#37C46A" : status === "error" ? "#F0553B" : C.amber }}>
          {status === "live" ? <Wifi size={12} /> : <WifiOff size={12} />}{status === "live" ? "LIVE" : status === "error" ? "PROXY DOWN" : "SIM"}
        </span>
        <div className="flex items-center gap-1">
          {[["radar", "RADAR"], ["map", "MAP"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: view === k ? C.ink : C.dim,
                background: view === k ? "#2563EB" : "rgba(28,32,41,0.8)", marginRight: 4 }}>
              {label}
            </button>
          ))}
          {[20, 50, 100].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? teal : "rgba(20,28,25,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
      <div className="absolute left-0 right-0 flex items-center gap-1 px-3"
        style={{ top: 34, flexWrap: "wrap", zIndex: 1200 }}>
        {[["all", "ALL"], ["usv", "SEA DRONES"], ["sub", "SUB SUPPORT"]].map(([k, label]) => {
          const n = k === "usv" ? plotted.filter((v) => v.usv).length
                  : k === "sub" ? plotted.filter((v) => v.subSupport).length
                  : plotted.length;
          const col = k === "usv" ? "#2DD4BF" : k === "sub" ? "#F0553B" : "#2563EB";
          return (
            <button key={k} onClick={() => setOnly(k)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: only === k ? C.ink : C.dim,
                background: only === k ? col : "rgba(28,32,41,0.8)",
                border: `1px solid ${only === k ? col : "transparent"}` }}>
              {label} {n}
            </button>
          );
        })}
      </div>
      {view === "map" && (
        <div className="px-2 pb-1" style={{ paddingTop: 44 }}>
          <RadarMap mode="sea"
            center={center}
            radiusNm={radius}
            sel={sel}
            onSel={setSel}
            height="min(52vh, 420px)"
            contacts={shown.map((v) => ({
              id: v.id, callsign: v.name || v.id, lat: v.lat, lon: v.lon,
              headingDeg: Number.isFinite(v.headingDeg) ? v.headingDeg : v.cogDeg,
              sogKt: v.sogKt,
              isDrone: !!v.usv,            // violet chevrons = sea drones
              military: !!v.subSupport,    // red chevrons = submarine support (surface ships)
              trail: v.trail,
            }))} />
        </div>
      )}
      <svg viewBox="0 0 400 400" className="w-full" style={{ display: view === "map" ? "none" : "block", maxHeight: 420 }}>
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
        {shown.map((v, idx) => {
          const col = shipColor(v), isSel = v.id === sel, moving = v.sogKt != null && v.sogKt >= 0.5;
          // Ships are slow, so trails are always on — otherwise nobody would ever see them.
          // Unselected trails are decimated and capped to the nearest 80 contacts so a busy
          // port doesn't put tens of thousands of SVG points on screen.
          const showTrail = v.trail.length > 1 && (isSel || (moving && idx < 80));
          const pts = isSel ? v.trail : v.trail.filter((_, i) => i % 4 === 0);
          const dir = (v.headingDeg != null ? v.headingDeg : v.cogDeg) || 0;
          return (
            <g key={v.id} transform={`translate(${v.x} ${v.y})`} onClick={() => setSel(v.id)} style={{ cursor: "pointer" }}>
              {showTrail && (
                <polyline points={pts.map((p) => `${p[0] - v.x},${p[1] - v.y}`).join(" ")}
                  fill="none" stroke={col} strokeWidth={isSel ? 1.4 : 1}
                  strokeOpacity={isSel ? 0.55 : 0.28} strokeLinejoin="round" strokeLinecap="round" />
              )}
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
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between py-2 font-mono"
        style={{ pointerEvents: "none", zIndex: 1200, paddingRight: 12, paddingLeft: 12, background: "linear-gradient(0deg, rgba(8,19,15,0.92), rgba(8,19,15,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: shipColor(chosen), lineHeight: 1.5 }}>
            {chosen.subSupport ? "[SUB SUPPORT · surface ship] " : chosen.usv ? (chosen.usvConfidence === "name_match" ? "[SEA DRONE] " : "[SEA DRONE?] ") : ""}
            {chosen.name || chosen.id} · {chosen.sogKt != null ? chosen.sogKt.toFixed(1) + "kt" : "—"} · {chosen.cogDeg != null ? Math.round(chosen.cogDeg) + "°" : "moored"}
            {(shipTypeLabel(chosen.typeCode) || chosen.destination || chosen.lengthM) && (
              <span style={{ display: "block", color: C.dim, fontSize: 10 }}>
                {shipTypeLabel(chosen.typeCode) || "—"}
                {navStatusLabel(chosen.navStatus) ? ` · ${navStatusLabel(chosen.navStatus)}` : ""}
                {chosen.destination ? ` · → ${chosen.destination}` : ""}
                {chosen.eta ? ` (ETA ${chosen.eta})` : ""}
              </span>
            )}
            {(chosen.lengthM || chosen.draughtM || chosen.imo) && (
              <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
                {chosen.lengthM ? `${chosen.lengthM}m × ${chosen.beamM || "?"}m` : ""}
                {chosen.draughtM ? ` · draught ${chosen.draughtM.toFixed(1)}m` : ""}
                {chosen.imo ? ` · IMO ${chosen.imo}` : ""}
                {chosen.callSign ? ` · ${chosen.callSign}` : ""}
              </span>
            )}
            <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
              MMSI {chosen.id} · {chosen.lat.toFixed(4)}, {chosen.lon.toFixed(4)} · {chosen.d.toFixed(1)}nm {bearingOf(chosen, center)}° from centre
              {(() => { const raw = acRef.current[chosen.id]; const t = raw && raw.trail;
                return t && t.length > 1 ? ` · path ${trackNm(t, center.lat).toFixed(1)}nm / ${Math.max(1, Math.round(t.length * 5 / 60))}min` : ""; })()}
            </span>
          </span>
        ) : status === "live" && plotted.length === 0 ? (
          <span style={{ color: upstream === "down" ? "#F6A821" : C.faint }}>
            {upstream === "down" ? (
              <>
                AIS provider is offline right now — this is upstream of StreetWatch, not your connection.
                <span style={{ display: "block", color: C.dim, marginTop: 3 }}>
                  Tap <b style={{ color: C.text }}>WATCH LIVE</b> above to open the source&rsquo;s own map — it runs a
                  separate receiver network and is unaffected. Vessels reappear here when our feed returns.
                </span>
              </>
            ) : (
              "0 in range — no community AIS receivers near here yet · coverage varies by region"
            )}
          </span>
        ) : selMissing ? (
          <span style={{ color: C.amber, lineHeight: 1.5 }}>
            {initialSelLabel || selMissing} is not reporting in this area now
            <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
              {initialSelSeen ? `last seen ${initialSelSeen} — ` : ""}
              AIS coverage is regional and vessels move; it may reappear on a later refresh.
            </span>
          </span>
        ) : (<span style={{ color: C.faint }}>Tap a vessel · {shown.length}{only !== "all" ? ` of ${plotted.length}` : ""} in range</span>)}
        <span style={{ color: C.dim }}>{center.city}</span>
      </div>
      {/* Stated plainly rather than left to assumption: quiet water is not necessarily
          empty water, and no public system can show what is underneath it. */}
      <div className="absolute left-0 right-0 px-3 font-mono"
        style={{ bottom: 34, zIndex: 5, pointerEvents: "none", fontSize: 9, color: C.faint, lineHeight: 1.45 }}>
        Surface vessels only — submarines and submersibles cannot be tracked by AIS anywhere
        in the world: VHF radio does not travel through seawater.
      </div>
    </div>
  );
}

// ---- Earth / weather — real NASA satellite imagery (no backend, CORS-free img). ----

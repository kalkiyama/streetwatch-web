import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, MapPin, Radio, Plane, X, Globe, Crosshair, ExternalLink,
  Car, Ship, CloudSun, Camera, PawPrint, Satellite, SignalHigh,
  Radar, Wifi, WifiOff, Star, Navigation,
} from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import CATALOG from "./catalog.json";

// ---------------------------------------------------------------------------
//  PALETTE — traffic-operations console. Colors inline (no Tailwind compiler);
//  layout/responsive via Tailwind core utilities.
// ---------------------------------------------------------------------------
const C = {
  ink: "#0E1116", panel: "#161A21", panel2: "#1C212B", line: "#2A303C",
  text: "#E8EAED", dim: "#8A94A3", faint: "#5A6473", amber: "#F6A821", cyan: "#5AC8FA",
};

// Public layers — every source is published for public viewing.
const LAYERS = {
  traffic:  { label: "Traffic",  icon: Car,       color: "#F6A821", camera: true,  desc: "Public DOT / motorway road cameras." },
  aviation: { label: "Aviation", icon: Plane,     color: "#5AC8FA", camera: false, desc: "Open ADS-B live flight & airport activity." },
  marine:   { label: "Marine",   icon: Ship,      color: "#2DD4BF", camera: false, desc: "Open AIS live ship positions & ports." },
  weather:  { label: "Earth",    icon: CloudSun,  color: "#A78BFA", camera: false, desc: "Public satellite & weather imagery." },
  webcam:   { label: "Webcams",  icon: Camera,    color: "#37C46A", camera: true,  desc: "Published public webcams — squares, beaches, landmarks." },
  wildlife: { label: "Wildlife", icon: PawPrint,  color: "#A3E635", camera: true,  desc: "Public conservation & nature livestreams." },
  space:    { label: "Space",    icon: Satellite, color: "#F472B6", camera: false, desc: "Live orbital feeds & tracking." },
};
const layerKeys = Object.keys(LAYERS);

// Representative anchors. In production each layer enumerates thousands of
// entries from its source's public API/directory; these prove the structure.
// Feed catalog lives in catalog.json — edit feeds there, no code changes needed.

// Route app-pushy sources to web-first viewers that render in the browser.
const resolveUrl = (cam) =>
  cam.layer === "aviation"
    ? `https://globe.adsbexchange.com/?SiteLat=${cam.lat.toFixed(3)}&SiteLon=${cam.lng.toFixed(3)}`
    : cam.url;
const openLive = (cam) => { if (typeof window !== "undefined") window.open(resolveUrl(cam), "_blank", "noopener,noreferrer"); };

// ===========================================================================
//  LIVE AVIATION — set BACKEND_URL to your deployed adsb-proxy.js to go live.
//  Empty string => realistic simulation so it runs with no backend.
// ===========================================================================
const BACKEND_URL = "https://streetwatch-proxy.onrender.com";
const RAD = Math.PI / 180;
const distKm = (aLat, aLng, bLat, bLng) => {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
};
const altColor = (a) => a.onGround ? "#6B7280" : a.altFt == null ? C.dim
  : a.altFt < 10000 ? C.amber : a.altFt < 25000 ? C.cyan : a.altFt < 35000 ? "#A78BFA" : "#E8EAED";
const PFX = ["BAW","UAL","DLH","UAE","AIC","JAL","QFA","AFR","KLM","SIA","THY","QTR","ANA","CPA","AAL","SWR"];
const ACT = ["A320","B738","A21N","B77W","A35K","B789","A388","E190","B38M","A333"];
const rnd = (a, b) => a + Math.random() * (b - a);
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
function AviationRadar({ center }) {
  const [status, setStatus] = useState("sim");
  const [, setTick] = useState(0);
  const [sel, setSel] = useState(null);
  const [radius, setRadius] = useState(100);
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
        if (inc.length) { const prev = acRef.current, merged = {}; inc.forEach((a) => { const o = prev[a.id]; merged[a.id] = { ...a, tLat: a.lat, tLon: a.lon, lat: o ? o.lat : a.lat, lon: o ? o.lon : a.lon }; }); acRef.current = merged; }
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
  }, [center, radius]); // eslint-disable-line

  const R = 180, cx = 200, cy = 200;
  const plotted = Object.values(acRef.current).map((a) => {
    const dx = (a.lon - center.lng) * Math.cos(center.lat * RAD) * 60, dy = (a.lat - center.lat) * 60;
    const d = Math.hypot(dx, dy);
    return { ...a, d, x: cx + (dx / radius) * R, y: cy - (dy / radius) * R };
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
          {[60, 120, 250].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: radius === r ? C.ink : C.dim, background: radius === r ? C.cyan : "rgba(28,32,41,0.8)" }}>{r}nm</button>
          ))}
        </div>
      </div>
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
          const col = altColor(a), isSel = a.id === sel;
          return (
            <g key={a.id} transform={`translate(${a.x} ${a.y})`} onClick={() => setSel(a.id)} style={{ cursor: "pointer" }}>
              {isSel && <circle r="11" fill="none" stroke={col} strokeWidth="1" />}
              <g transform={`rotate(${a.headingDeg || 0})`}><polygon className={isSel ? "" : "rblip"} points="0,-6 4,5 0,2.5 -4,5" fill={col} stroke="#0A0E14" strokeWidth="0.5" /></g>
              {isSel && <text x="10" y="3" fill={col} fontSize="9" fontFamily="monospace">{a.callsign || a.id}</text>}
            </g>
          );
        })}
        <circle cx="200" cy="200" r="3" fill={C.cyan} />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 font-mono"
        style={{ background: "linear-gradient(0deg, rgba(10,14,20,0.92), rgba(10,14,20,0))", fontSize: 11 }}>
        {chosen ? (
          <span style={{ color: altColor(chosen) }}>{chosen.callsign} · {chosen.typeCode || "—"} · {chosen.onGround ? "GND" : (chosen.altFt / 1000).toFixed(0) + "k ft"} · {chosen.groundSpeedKt}kt · {Math.round(chosen.headingDeg)}°</span>
        ) : (<span style={{ color: C.faint }}>Tap an aircraft · {plotted.length} in range</span>)}
        <span style={{ color: C.dim }}>{center.name.split("·").pop().trim() || center.city}</span>
      </div>
    </div>
  );
}

// ---- Marine (AIS) — set AIS_BACKEND_URL to your deployed ais-proxy.js. ----
const AIS_BACKEND_URL = "https://streetwatch-proxy.onrender.com";
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
function MarineRadar({ center }) {
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
        if (inc.length) { const prev = acRef.current, merged = {}; inc.forEach((v) => { const o = prev[v.id]; merged[v.id] = { ...v, tLat: v.lat, tLon: v.lon, lat: o ? o.lat : v.lat, lon: o ? o.lon : v.lon }; }); acRef.current = merged; }
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
  }, [center, radius]); // eslint-disable-line

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
        ) : (<span style={{ color: C.faint }}>Tap a vessel · {plotted.length} in range</span>)}
        <span style={{ color: C.dim }}>{center.city}</span>
      </div>
    </div>
  );
}

// ---- Earth / weather — real NASA satellite imagery (no backend, CORS-free img). ----
const GIBS_LAYERS = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "Terra" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "Aqua" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS" },
  { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "721·IR" },
];
const ymd = (d) => d.toISOString().slice(0, 10);
function EarthView({ center }) {
  const [layer, setLayer] = useState(GIBS_LAYERS[0].id);
  const [back, setBack] = useState(1);
  const [err, setErr] = useState(false);
  const violet = "#A78BFA";
  const date = new Date(Date.now() - back * 86400000);
  const time = ymd(date);
  const latSpan = 18, lonSpan = 24;
  const minLat = Math.max(-90, center.lat - latSpan / 2), maxLat = Math.min(90, center.lat + latSpan / 2);
  const minLon = Math.max(-180, center.lng - lonSpan / 2), maxLon = Math.min(180, center.lng + lonSpan / 2);
  const src = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=${time}` +
    `&BBOX=${minLat.toFixed(3)},${minLon.toFixed(3)},${maxLat.toFixed(3)},${maxLon.toFixed(3)}` +
    `&CRS=EPSG:4326&LAYERS=${layer}&FORMAT=image/jpeg&WIDTH=640&HEIGHT=480`;
  useEffect(() => { setErr(false); }, [src]);
  const rel = back === 1 ? "yesterday" : `${back} days ago`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#0A0A12", aspectRatio: "4 / 3" }}>
      {!err ? (
        <img src={src} alt={`Satellite imagery near ${center.city}`} onError={() => setErr(true)}
          className="w-full h-full" style={{ objectFit: "cover", display: "block" }} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
          <CloudSun size={40} color={violet} strokeWidth={1.4} />
          <div style={{ color: C.dim, fontSize: 13 }}>No imagery for {time} at this spot — try an earlier day or another layer.</div>
        </div>
      )}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,10,18,0.85), rgba(10,10,18,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono" style={{ fontSize: 11, letterSpacing: 1, background: `${violet}22`, color: violet }}>
          <SignalHigh size={12} /> NRT · DAILY
        </span>
        <div className="flex items-center gap-1">
          {GIBS_LAYERS.map((l) => (
            <button key={l.id} onClick={() => setLayer(l.id)} className="px-1.5 py-0.5 rounded font-mono"
              style={{ fontSize: 10, color: layer === l.id ? C.ink : C.dim, background: layer === l.id ? violet : "rgba(20,18,30,0.75)" }}>{l.label}</button>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2" style={{ background: "linear-gradient(0deg, rgba(10,10,18,0.92), rgba(10,10,18,0))" }}>
        <div className="flex items-center justify-between font-mono" style={{ fontSize: 11, color: C.dim }}>
          <span style={{ color: violet }}>{time} · {rel}</span>
          <span style={{ color: C.faint }}>NASA Worldview / GIBS</span>
        </div>
        <input type="range" min={1} max={8} step={1} value={back} onChange={(e) => setBack(parseInt(e.target.value, 10))}
          className="w-full mt-1.5" style={{ accentColor: violet }} />
      </div>
    </div>
  );
}

// ---- Space — live ISS tracker (keyless CORS-open API, no backend). ----
function SpaceView() {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [bgErr, setBgErr] = useState(false);
  const liveRef = useRef(false); const everRef = useRef(false);
  const trackRef = useRef([]); const simRef = useRef({ phase: 0, lon: -30 });
  const [, setTick] = useState(0);
  const pink = "#F472B6";
  const push = (lat, lon) => { const t = trackRef.current; const p = t[t.length - 1]; if (!p || Math.abs(p[1] - lon) < 60) t.push([lat, lon]); else t.push(null, [lat, lon]); if (t.length > 140) t.shift(); };

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
        const p = { lat, lon: st.lon, altKm: 420, velKmh: 27600 };
        setPos(p); push(lat, st.lon); setStatus("sim");
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => { alive = false; clearInterval(pollId); clearInterval(tickId); };
  }, []);

  const W = 720, H = 360;
  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  const bg = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2024-01-01&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=BlueMarble_ShadedRelief_Bathymetry&FORMAT=image/jpeg&WIDTH=720&HEIGHT=360`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#04121F", aspectRatio: "2 / 1" }}>
      {!bgErr && <img src={bg} alt="" onError={() => setBgErr(true)} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover", opacity: 0.85 }} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", position: "relative" }}>
        {bgErr && <rect x="0" y="0" width={W} height={H} fill="#08131F" />}
        {[-60, -30, 0, 30, 60].map((la) => <line key={la} x1="0" y1={py(la)} x2={W} y2={py(la)} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
        {[-120, -60, 0, 60, 120].map((lo) => <line key={lo} x1={px(lo)} y1="0" x2={px(lo)} y2={H} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
        {trackRef.current.map((p, i) => p && trackRef.current[i - 1] ? (
          <line key={i} x1={px(trackRef.current[i - 1][1])} y1={py(trackRef.current[i - 1][0])} x2={px(p[1])} y2={py(p[0])} stroke={pink} strokeWidth="1.4" opacity="0.5" />
        ) : null)}
        {pos && (
          <g transform={`translate(${px(pos.lon)} ${py(pos.lat)})`}>
            <circle r="10" fill="none" stroke={pink} strokeWidth="1" className="rblip" />
            <circle r="4" fill={pink} stroke="#04121F" strokeWidth="1" />
            <text x="10" y="-8" fill={pink} fontSize="11" fontFamily="monospace">ISS</text>
          </g>
        )}
      </svg>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2" style={{ background: "linear-gradient(180deg, rgba(4,18,31,0.85), rgba(4,18,31,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono" style={{ fontSize: 11, letterSpacing: 1, background: status === "live" ? "rgba(55,196,106,0.16)" : "rgba(246,168,33,0.16)", color: status === "live" ? "#37C46A" : C.amber }}>
          <Satellite size={12} />{status === "live" ? "LIVE · ISS" : status === "connecting" ? "CONNECTING" : "SIM · ISS"}
        </span>
        <span className="font-mono" style={{ fontSize: 10, color: C.faint }}>wheretheiss.at</span>
      </div>
      {pos && (
        <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 gap-2 px-3 py-2 font-mono" style={{ background: "linear-gradient(0deg, rgba(4,18,31,0.92), rgba(4,18,31,0))", fontSize: 11 }}>
          {[["LAT", pos.lat.toFixed(2) + "°"], ["LON", pos.lon.toFixed(2) + "°"], ["ALT", Math.round(pos.altKm) + " km"], ["VEL", Math.round(pos.velKmh).toLocaleString() + " km/h"]].map(([k, v]) => (
            <div key={k}><div style={{ color: C.faint, fontSize: 9 }}>{k}</div><div style={{ color: pink }}>{v}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorldMap({ feeds, selectedId, onSelect }) {
  const elRef = useRef(null); const mapRef = useRef(null); const layerRef = useRef(null);
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    try {
      const map = Leaflet.map(elRef.current, { center: [20, 0], zoom: 2, worldCopyJump: true, preferCanvas: true });
      Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap, &copy; CARTO",
      }).addTo(map);
      layerRef.current = Leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
    } catch {}
    return () => { try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } } catch {} };
  }, []);
  useEffect(() => {
    const lg = layerRef.current; if (!lg) return;
    lg.clearLayers();
    feeds.forEach((f) => {
      const col = LAYERS[f.layer].color, sel = f.id === selectedId;
      const m = Leaflet.circleMarker([f.lat, f.lng], { radius: sel ? 7 : 4, color: sel ? "#FFFFFF" : col, weight: sel ? 2 : 1, fillColor: col, fillOpacity: 0.9 });
      m.on("click", () => onSelect(f.id));
      m.bindTooltip(f.name, { direction: "top", opacity: 0.9 });
      m.addTo(lg);
    });
  }, [feeds, selectedId, onSelect]);
  return <div ref={elRef} style={{ width: "100%", height: "100%", background: "#0B0E13" }} />;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// Animated live preview for camera layers.
function LiveViewport({ cam, now, onOpen }) {
  const canvasRef = useRef(null);
  const color = LAYERS[cam.layer].color;
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf, t = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.fillStyle = "#0A0D12"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(90,100,115,0.18)"; ctx.lineWidth = 1;
      const vpx = w / 2, vpy = h * 0.42;
      for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(vpx + i * 14, vpy); ctx.lineTo(vpx + i * 90, h); ctx.stroke(); }
      for (let j = 1; j <= 7; j++) { const y = vpy + Math.pow(j / 7, 2) * (h - vpy); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let k = 0; k < 5; k++) {
        const p = ((t * (0.4 + k * 0.12) + k * 40) % 100) / 100;
        const y = vpy + Math.pow(p, 2) * (h - vpy);
        const x = vpx + (k % 2 === 0 ? 1 : -1) * (18 + p * 120); const s = 1 + p * 4;
        ctx.fillStyle = k % 3 === 0 ? color : "rgba(232,234,237,0.6)"; ctx.fillRect(x, y, s * 1.6, s);
      }
      if (!reduce) {
        const by = (t * 1.4 % (h + 60)) - 30;
        const g = ctx.createLinearGradient(0, by - 30, 0, by + 30);
        g.addColorStop(0, "rgba(55,196,106,0)"); g.addColorStop(0.5, "rgba(55,196,106,0.10)"); g.addColorStop(1, "rgba(55,196,106,0)");
        ctx.fillStyle = g; ctx.fillRect(0, by - 30, w, 60);
      }
      t += reduce ? 0 : 1; raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [cam, color]);
  return <Frame cam={cam} now={now} onOpen={onOpen}><canvas ref={canvasRef} width={640} height={400} className="w-full h-full block" /></Frame>;
}

// Static preview for data layers (aviation, marine, weather, space).
function DataPreview({ cam, now, onOpen }) {
  const L = LAYERS[cam.layer]; const Icon = L.icon;
  return (
    <Frame cam={cam} now={now} onOpen={onOpen}>
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background:
        `radial-gradient(600px 300px at 50% 30%, ${L.color}14, transparent), #0A0D12` }}>
        <Icon size={54} color={L.color} strokeWidth={1.4} />
        <div className="font-mono" style={{ fontSize: 12, color: C.dim, letterSpacing: 1 }}>{cam.src.toUpperCase()}</div>
      </div>
    </Frame>
  );
}

function Frame({ cam, now, onOpen, children }) {
  const L = LAYERS[cam.layer];
  const ts = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="group relative w-full overflow-hidden rounded-lg"
      style={{ border: `1px solid ${C.line}`, background: "#0A0D12", aspectRatio: "16 / 10", cursor: "pointer" }}>
      {children}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100"
        style={{ transition: "opacity .18s", background: "rgba(10,13,18,0.35)" }}>
        <span className="flex items-center gap-2 px-3 py-2 rounded font-mono"
          style={{ background: L.color, color: C.ink, fontSize: 12, fontWeight: 700 }}>
          <ExternalLink size={14} /> Open live in browser
        </span>
      </div>
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2"
        style={{ background: "linear-gradient(180deg, rgba(10,13,18,0.85), rgba(10,13,18,0))" }}>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: `${L.color}22` }}>
          <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: L.color, display: "inline-block" }} />
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: 1, color: L.color }}>LIVE</span>
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: C.dim }}>{cam.id}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2"
        style={{ background: "linear-gradient(0deg, rgba(10,13,18,0.9), rgba(10,13,18,0))" }}>
        <div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{cam.name}</div>
          <div className="font-mono" style={{ fontSize: 11, color: C.faint }}>{cam.lat.toFixed(3)}, {cam.lng.toFixed(3)} · {cam.src}</div>
        </div>
        <div className="font-mono text-right" style={{ fontSize: 11, color: C.faint }}>{ts}</div>
      </div>
    </div>
  );
}

export default function StreetWatch() {
  const now = useClock();
  const [tab, setTab] = useState("world");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState([...layerKeys]);
  const [continent, setContinent] = useState("All");
  const [country, setCountry] = useState("All");
  const [selectedId, setSelectedId] = useState("T-LDN-01");
  const [favorites, setFavorites] = useState([]);
  const [favOnly, setFavOnly] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [nearMe, setNearMe] = useState(false);
  const [geoErr, setGeoErr] = useState(null);

  const toggle = (k) => setActive((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);

  useEffect(() => {
    try { const v = localStorage.getItem("favorites"); if (v) setFavorites(JSON.parse(v)); } catch {}
  }, []);
  const isFav = (id) => favorites.includes(id);
  const toggleFav = (id) => setFavorites((f) => {
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
    return next;
  });
  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoErr("Location unavailable on this device"); return; }
    setGeoErr("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setNearMe(true); setGeoErr(null); },
      () => setGeoErr("Location permission denied"),
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const continents = useMemo(() => ["All", ...Array.from(new Set(CATALOG.map((c) => c.continent))).sort()], []);
  const countries = useMemo(() => ["All", ...Array.from(new Set(
    CATALOG.filter((c) => continent === "All" || c.continent === continent).map((c) => c.country))).sort()], [continent]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((c) => {
      const hitQ = !q || [c.name, c.city, c.region, c.country, c.continent, c.id, LAYERS[c.layer].label].join(" ").toLowerCase().includes(q);
      const hitReg = (continent === "All" || c.continent === continent) && (country === "All" || c.country === country);
      return hitQ && hitReg && active.includes(c.layer) && (!favOnly || favorites.includes(c.id));
    });
  }, [query, active, continent, country, favOnly, favorites]);

  const selected = CATALOG.find((c) => c.id === selectedId) || results[0] || CATALOG[0];

  const grouped = useMemo(() => {
    const g = {};
    results.forEach((c) => { (g[c.continent] = g[c.continent] || []).push(c); });
    Object.values(g).forEach((arr) => arr.sort((a, b) => (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0)));
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, favorites]);

  const nearList = useMemo(() => {
    if (!nearMe || !userLoc) return null;
    return results.map((c) => ({ ...c, distKm: distKm(userLoc.lat, userLoc.lng, c.lat, c.lng) })).sort((a, b) => a.distKm - b.distKm);
  }, [nearMe, userLoc, results]);

  const renderRow = (c) => {
    const sel = c.id === selected.id; const L = LAYERS[c.layer]; const Icon = L.icon; const fav = isFav(c.id);
    return (
      <button key={c.id} onClick={() => setSelectedId(c.id)} className="sw-row w-full text-left px-4 py-2.5 flex items-center gap-3"
        style={{ background: sel ? C.panel2 : "transparent", borderLeft: `2px solid ${sel ? L.color : "transparent"}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-center flex-shrink-0 rounded" style={{ width: 30, height: 30, background: C.ink, border: `1px solid ${C.line}` }}>
          <Icon size={14} color={sel ? L.color : C.dim} />
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 13, color: C.text, fontWeight: sel ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
          <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>{c.city} · {c.country}{c.distKm != null ? ` · ${Math.round(c.distKm).toLocaleString()} km` : ""}</div>
        </div>
        <span role="button" tabIndex={0} aria-label="favorite"
          onClick={(e) => { e.stopPropagation(); toggleFav(c.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFav(c.id); } }}
          style={{ cursor: "pointer", display: "flex", padding: 3 }}>
          <Star size={15} color={fav ? C.amber : C.faint} fill={fav ? C.amber : "none"} />
        </span>
      </button>
    );
  };

  const bounds = useMemo(() => {
    const set = results.length ? results : CATALOG;
    return { minLat: Math.min(...set.map((c) => c.lat)), maxLat: Math.max(...set.map((c) => c.lat)),
             minLng: Math.min(...set.map((c) => c.lng)), maxLng: Math.max(...set.map((c) => c.lng)) };
  }, [results]);
  const plot = (c) => {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const nx = maxLng === minLng ? 0.5 : (c.lng - minLng) / (maxLng - minLng);
    const ny = maxLat === minLat ? 0.5 : (c.lat - minLat) / (maxLat - minLat);
    return { left: `${8 + nx * 84}%`, top: `${88 - ny * 76}%` };
  };

  const Preview = LAYERS[selected.layer].camera ? LiveViewport : DataPreview;

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100%", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes pdot { 0%,100%{opacity:1} 50%{opacity:.4} }
        .pulse-dot{ animation: pdot 1.4s ease-in-out infinite; }
        @keyframes ping { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.6);opacity:0} }
        .mk-ping{ animation: ping 1.8s ease-out infinite; }
        @keyframes rsweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .rsweep{ transform-origin:200px 200px; animation: rsweep 4s linear infinite; }
        @keyframes rblip { 0%,100%{opacity:1} 50%{opacity:.45} }
        .rblip{ animation: rblip 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .pulse-dot,.mk-ping,.rsweep,.rblip{ animation:none !important } }
        .sw-input::placeholder{ color:${C.faint}; }
        .sw-row:hover{ background:${C.panel2} !important; }
        button:focus-visible,input:focus-visible{ outline:2px solid ${C.cyan}; outline-offset:2px; }
      `}</style>

      <header className="flex items-center justify-between px-4 md:px-6 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded" style={{ width: 30, height: 30, background: C.amber }}>
            <Radio size={17} color={C.ink} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: 0.3, fontSize: 15 }}>STREETWATCH</div>
            <div className="font-mono" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>GLOBAL PUBLIC-FEED CONSOLE · DEMO</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {[{ k: "world", label: "World", icon: Globe, on: true }, { k: "drones", label: "Drones", icon: Plane, on: false }].map((t) => (
            <button key={t.k} onClick={() => t.on && setTab(t.k)} disabled={!t.on}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono"
              style={{ fontSize: 12, letterSpacing: 0.5, color: tab === t.k ? C.ink : t.on ? C.dim : C.faint,
                background: tab === t.k ? C.amber : "transparent", cursor: t.on ? "pointer" : "not-allowed" }}>
              <t.icon size={13} />{t.label}{!t.on && <span style={{ fontSize: 9 }}>· soon</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 58px)" }}>
        <aside className="w-full lg:w-80 flex-shrink-0" style={{ borderRight: `1px solid ${C.line}`, background: C.panel }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-2 px-3 rounded" style={{ background: C.ink, border: `1px solid ${C.line}`, height: 40 }}>
              <Search size={16} color={C.faint} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="sw-input bg-transparent w-full"
                placeholder="Continent, country, city, layer…" style={{ color: C.text, fontSize: 14, border: "none" }} />
              {query && <button onClick={() => setQuery("")}><X size={15} color={C.faint} /></button>}
            </div>
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>PUBLIC LAYERS</div>
            <div className="flex flex-wrap gap-1.5">
              {layerKeys.map((k) => {
                const L = LAYERS[k]; const on = active.includes(k); const Icon = L.icon;
                return (
                  <button key={k} onClick={() => toggle(k)} className="flex items-center gap-1 px-2 py-1 rounded"
                    style={{ fontSize: 11, color: on ? C.ink : C.dim, background: on ? L.color : C.panel2,
                      border: `1px solid ${on ? L.color : C.line}` }}>
                    <Icon size={12} />{L.label}
                  </button>
                );
              })}
            </div>
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>REGION</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {continents.map((ct) => (
                <button key={ct} onClick={() => { setContinent(ct); setCountry("All"); }}
                  className="px-2 py-1 rounded font-mono flex-shrink-0"
                  style={{ fontSize: 11, whiteSpace: "nowrap",
                    color: continent === ct ? C.ink : C.dim,
                    background: continent === ct ? C.cyan : C.panel2,
                    border: `1px solid ${continent === ct ? C.cyan : C.line}` }}>
                  {ct === "North America" ? "N. America" : ct === "South America" ? "S. America" : ct}
                </button>
              ))}
            </div>
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full mt-2 px-2.5 rounded font-mono"
              style={{ height: 34, fontSize: 12, color: C.text, background: C.ink, border: `1px solid ${C.line}` }}>
              {countries.map((cn) => <option key={cn} value={cn} style={{ background: C.panel }}>{cn === "All" ? "All countries" : cn}</option>)}
            </select>
            {(continent !== "All" || country !== "All") && (
              <button onClick={() => { setContinent("All"); setCountry("All"); }}
                className="mt-2 font-mono flex items-center gap-1" style={{ fontSize: 10, color: C.faint }}>
                <X size={11} /> clear region
              </button>
            )}
            <div className="flex gap-1.5 mt-3">
              <button onClick={() => setFavOnly((v) => !v)} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: favOnly ? C.ink : C.dim, background: favOnly ? C.amber : C.panel2, border: `1px solid ${favOnly ? C.amber : C.line}` }}>
                <Star size={12} fill={favOnly ? C.ink : "none"} /> Favorites
              </button>
              <button onClick={() => (nearMe ? setNearMe(false) : locateMe())} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: nearMe ? C.ink : C.dim, background: nearMe ? C.cyan : C.panel2, border: `1px solid ${nearMe ? C.cyan : C.line}` }}>
                <Navigation size={12} /> Near me
              </button>
            </div>
            {geoErr === "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>locating…</div>}
            {geoErr && geoErr !== "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: "#F0553B" }}>{geoErr}</div>}
          </div>

          <div style={{ maxHeight: "46vh", overflowY: "auto" }} className="lg:max-h-none">
            <div className="px-4 py-2 font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <span>{results.length} FEEDS</span><span>{nearList ? "NEAREST FIRST" : grouped.length + " REGIONS"}</span>
            </div>
            {results.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ color: C.dim, fontSize: 13 }}>
                {favOnly ? "No favorites yet — tap the ☆ on any feed to save it." : "No feeds match. Try “Asia”, “Tokyo”, or enable more layers."}
              </div>
            )}
            {nearList
              ? nearList.map((c) => renderRow(c))
              : grouped.map(([continent, items]) => (
                <div key={continent}>
                  <div className="px-4 py-1.5 font-mono flex items-center gap-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1, background: C.ink, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                    <Globe size={11} />{continent.toUpperCase()} · {items.length}
                  </div>
                  {items.map((c) => renderRow(c))}
                </div>
              ))}
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-6 flex flex-col gap-4">
          <section className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, height: 300, flexShrink: 0 }}>
            <WorldMap feeds={results} selectedId={selected.id} onSelect={setSelectedId} />
          </section>

          <section className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 min-w-0">
              {selected.layer === "aviation"
                ? <AviationRadar center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "marine"
                ? <MarineRadar center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "weather"
                ? <EarthView center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "space"
                ? <SpaceView />
                : <Preview cam={selected} now={now} onOpen={() => openLive(selected)} />}
            </div>
            <div className="w-full md:w-64 flex-shrink-0 rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <div className="font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
                <span className="flex items-center gap-1.5">
                  {React.createElement(LAYERS[selected.layer].icon, { size: 12, color: LAYERS[selected.layer].color })}
                  {LAYERS[selected.layer].label.toUpperCase()} FEED
                </span>
                <button onClick={() => toggleFav(selected.id)} aria-label="favorite" style={{ display: "flex" }}>
                  <Star size={16} color={isFav(selected.id) ? C.amber : C.faint} fill={isFav(selected.id) ? C.amber : "none"} />
                </button>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{selected.name}</div>
              <div className="flex items-center gap-1.5 mt-1" style={{ color: C.dim, fontSize: 13 }}>
                <MapPin size={13} color={LAYERS[selected.layer].color} /> {selected.city}, {selected.country}
              </div>
              <div className="mt-4 space-y-2 font-mono" style={{ fontSize: 12 }}>
                {[["CONTINENT", selected.continent], ["REGION", selected.region], ["SOURCE", selected.src], ["COORD", `${selected.lat.toFixed(2)}, ${selected.lng.toFixed(2)}`]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 6 }}>
                    <span style={{ color: C.faint }}>{k}</span><span style={{ color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openLive(selected)} className="mt-4 w-full flex items-center justify-center gap-2 rounded py-2.5 font-mono"
                style={{ background: LAYERS[selected.layer].color, color: C.ink, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, border: "none", cursor: "pointer" }}>
                <ExternalLink size={15} /> OPEN SOURCE
              </button>
              <div className="mt-2 font-mono break-all" style={{ fontSize: 10, color: C.faint }}>↗ {resolveUrl(selected)}</div>
            </div>
          </section>

          <section className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="font-mono flex items-center gap-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <SignalHigh size={12} color={C.amber} /> PUBLISHED PUBLIC FEEDS ONLY
            </div>
            <p style={{ fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 1.6 }}>
              Every layer draws only on feeds published for public viewing — official traffic authorities, open ADS-B & AIS
              networks, government/space-agency imagery, and public webcam directories. Clicking any feed hands off to the
              source's own live page in the browser, so there's no cross-origin or RTSP barrier. Private cameras of private
              spaces (homes, shop interiors, anything reachable only because it's unsecured) are deliberately excluded — viewing
              those is unauthorized access, not public data.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

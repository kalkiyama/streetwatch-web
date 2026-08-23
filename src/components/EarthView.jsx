import { useState, useEffect } from "react";
import { CloudSun, SignalHigh } from "lucide-react";
import { C } from "../theme.js";

const GIBS_LAYERS = [
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "Terra" },
  { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "Aqua" },
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS" },
  { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "721·IR" },
];
const ymd = (d) => d.toISOString().slice(0, 10);
export default function EarthView({ center }) {
  const [layer, setLayer] = useState(GIBS_LAYERS[0].id);
  const [back, setBack] = useState(1);
  const [err, setErr] = useState(false);
  const violet = "#A78BFA";
  // The clock is read ONCE, at mount, and every date derives from that. useMemo did not help:
  // its callback still runs during render, which is what the rule objects to. A lazy useState
  // initialiser runs once and never again.
  //
  // It also fixes a real latent bug — reading Date.now() inline meant the imagery could roll to a
  // new day mid-session, silently swapping the picture someone was looking at.
  const [today] = useState(() => Date.now());
  const date = new Date(today - back * 86400000);
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

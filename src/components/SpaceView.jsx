import { useState, useEffect, useRef } from "react";
import { Satellite } from "lucide-react";
import { C } from "../theme.js";

export default function SpaceView() {
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
      <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, lineHeight: 1.5, background: "rgba(4,18,31,0.6)" }}>
        Position computed from public NORAD orbital elements via wheretheiss.at (a third-party
        service, not verified by StreetWatch). The orbit is inclined ~51.6° to the equator, so
        the ground track sweeps between about 51.6°N and 51.6°S — it does not follow the equator.
      </div>
    </div>
  );
}


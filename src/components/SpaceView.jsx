import { useState, useEffect, useRef } from "react";
import { Satellite } from "lucide-react";
import * as sat from "satellite.js";
import { C } from "../theme.js";

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

export default function SpaceView() {
  const [pos, setPos] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [bgErr, setBgErr] = useState(false);
  const liveRef = useRef(false); const everRef = useRef(false);
  const simRef = useRef({ phase: 0, lon: -30 });
  const pink = "#F472B6";
  // The track is DRAWN, so it is state rather than a ref. A null entry is a deliberate break in the
  // polyline where the ground track wraps the antimeridian — without it the line whips across the
  // whole map. Kept to 140 points so the tail fades rather than encircling the globe.
  const [track, setTrack] = useState([]);
  const push = (lat, lon) => setTrack((t) => {
    const p = t[t.length - 1];
    const next = (!p || Math.abs(p[1] - lon) < 60) ? [...t, [lat, lon]] : [...t, null, [lat, lon]];
    return next.length > 140 ? next.slice(next.length - 140) : next;
  });

  // ── satellite layer ────────────────────────────────────────────────────────
  // Element sets are FETCHED (rarely — they change a few times a day); positions are COMPUTED here
  // every tick by SGP4. That is why the satrecs live in a ref and never in state: they are an
  // input to a computation, not something the UI renders directly.
  const [groups, setGroups] = useState([]);
  const [on, setOn] = useState({ stations: true });
  const [meta, setMeta] = useState({});        // group -> { total, served, capped, oldestEpochHours }
  const [loading, setLoading] = useState({});  // group -> true while its elements are in flight
  const satsRef = useRef({});                  // group -> [{ id, name, satrec }] — never rendered
  const [draw, setDraw] = useState([]);        // [{ x, y, color }] recomputed each tick — rendered

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
    const wanted = Object.keys(on).filter((g) => on[g] && !satsRef.current[g]);
    if (!wanted.length) return;
    wanted.forEach((g) => {
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
          setLoading((s) => ({ ...s, [g]: false }));
        })
        .catch(() => { if (alive) { satsRef.current[g] = []; setLoading((s) => ({ ...s, [g]: false })); } });
    });
    return () => { alive = false; };
  }, [on]);

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
      // Propagate every enabled group to the current instant. Worst case is ~940 SGP4 solves at 1Hz,
      // a few milliseconds — cheap enough that no throttling or web worker is warranted yet.
      const now = new Date();
      const gmst = sat.gstime(now);
      const out = [];
      Object.keys(satsRef.current).forEach((g) => {
        if (!on[g]) return;
        const color = GROUP_COLOR[g] || C.faint;
        satsRef.current[g].forEach((s) => {
          try {
            const pv = sat.propagate(s.satrec, now);
            if (!pv || !pv.position) return;                       // decayed or unpropagatable
            const gd = sat.eciToGeodetic(pv.position, gmst);
            const lat = sat.degreesLat(gd.latitude), lon = sat.degreesLong(gd.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            out.push({ x: ((lon + 180) / 360) * 720, y: ((90 - lat) / 180) * 360, color });
          } catch { /* one bad element set must not stop the sweep */ }
        });
      });
      setDraw(out);
    }, 1000);
    return () => { alive = false; clearInterval(pollId); clearInterval(tickId); };
  }, [on]);

  const W = 720, H = 360;
  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  const bg = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2024-01-01&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=BlueMarble_ShadedRelief_Bathymetry&FORMAT=image/jpeg&WIDTH=720&HEIGHT=360`;

  const shownGroups = Object.keys(on).filter((g) => on[g] && meta[g]);
  const shownCount = draw.length;
  // The oldest epoch across everything on screen, because the honest number is the worst one.
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

      <div className="relative w-full" style={{ aspectRatio: "2 / 1" }}>
        {!bgErr && <img src={bg} alt="" onError={() => setBgErr(true)} className="absolute inset-0 w-full h-full" style={{ objectFit: "cover", opacity: 0.85 }} />}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block", position: "relative" }}>
          {bgErr && <rect x="0" y="0" width={W} height={H} fill="#08131F" />}
          {[-60, -30, 0, 30, 60].map((la) => <line key={la} x1="0" y1={py(la)} x2={W} y2={py(la)} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
          {[-120, -60, 0, 60, 120].map((lo) => <line key={lo} x1={px(lo)} y1="0" x2={px(lo)} y2={H} stroke="rgba(138,148,163,0.18)" strokeWidth="1" />)}
          {/* Satellites are drawn BENEATH the ISS track and marker: many small dots must not compete
              with the one object whose position is actually observed rather than computed. */}
          {draw.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="1.5" fill={d.color} opacity="0.85" />
          ))}
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

      <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, lineHeight: 1.5, background: "rgba(4,18,31,0.6)" }}>
        ISS position from public NORAD orbital elements via wheretheiss.at (a third-party service,
        not verified by StreetWatch). The orbit is inclined ~51.6° to the equator, so the ground
        track sweeps between about 51.6°N and 51.6°S — it does not follow the equator.
        {shownCount > 0 && (
          <>
            {" "}The {shownCount.toLocaleString()} coloured dots are COMPUTED, not observed: their
            positions are propagated from CelesTrak orbital elements rather than broadcast by the
            satellites themselves, unlike the aircraft and vessels elsewhere in this app.
            {oldestEpoch > 0 && ` Oldest element set on screen is ${Math.round(oldestEpoch)}h old — accuracy degrades as that number grows.`}
            {capNotes.length > 0 && ` Showing a capped subset: ${capNotes.join("; ")}.`}
          </>
        )}
      </div>
    </div>
  );
}

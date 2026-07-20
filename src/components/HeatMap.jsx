import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { guardTouchScroll } from "./mapTouch.js";
import { C, heatColor, heatIntensity, HEAT_RAMP } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// Where military / UAV activity actually concentrates, measured from this sweep's own
// archive. Colour and size come from observed contact counts — not from any outside
// claim about where a conflict is.

export default function HeatMap({ days = 7, height = "min(68vh, 620px)" }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [full, setFull] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`${BACKEND_URL}/api/drones/heat?days=${days}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { if (alive) { setData(j); setState("ok"); } })
      .catch((e) => { if (alive) setState(String(e.message) === "503" ? "off" : "error"); });
    return () => { alive = false; };
  }, [days]);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      zoomControl: false, attributionControl: true, scrollWheelZoom: false,
      minZoom: 1, maxZoom: 10, worldCopyJump: true,
    }).setView([25, 10], 2);
    Leaflet.control.zoom({ position: "topright" }).addTo(map.current);
    Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 12,
    }).addTo(map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, []);

  useEffect(() => {
    if (map.current) setTimeout(() => map.current && map.current.invalidateSize(), 150);
  }, [full]);

  // re-measure whenever the frame size changes (entering AND leaving fullscreen)
  useEffect(() => { const t = setTimeout(() => map.current && map.current.invalidateSize(), 90); return () => clearTimeout(t); }, [full]);


  // Esc exits fullscreen, and the page behind shouldn't scroll while it's open
  useEffect(() => {
    if (!full) return;
    const esc = (e) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => map.current && map.current.invalidateSize(), 80);
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [full]);

  useEffect(() => {
    if (!map.current || !data || !data.sites) return;
    if (layer.current) layer.current.remove();
    layer.current = Leaflet.layerGroup().addTo(map.current);
    guardTouchScroll(map.current);
    data.sites.forEach((s) => {
      const t = heatIntensity(s.contacts, data.maxContacts || 2);
      const col = heatColor(t);
      Leaflet.circleMarker([s.lat, s.lon], {
        radius: 5 + t * 16,
        color: col, weight: 1.5, fillColor: col, fillOpacity: 0.35,
      })
        .bindPopup(
          `<b>${s.site}</b><br>${s.country || ""}<br>` +
          `${s.contacts} contact${s.contacts === 1 ? "" : "s"} · ${s.uav} UAV · ${s.military} military<br>` +
          `${s.points} observations over ${s.span_hours || 0}h<br>` +
          `<span style="opacity:.7">last seen ${new Date(s.last_seen).toLocaleString()}</span>`
        )
        .addTo(layer.current);
    });
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
  }, [data]);

  const shell = full
    ? { position: "fixed", inset: 0, zIndex: 1000, background: "#0A0D12", padding: 10,
        display: "flex", flexDirection: "column", gap: 6 }
    : {};

  return (
    <div className="px-3 pb-2" style={shell}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span className="font-mono" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1 }}>
          ACTIVITY MAP
        </span>
        <button onClick={() => setFull(!full)} className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 9, color: "#C084FC", border: "1px solid rgba(192,132,252,0.4)", background: "transparent" }}>
          {full ? <><X size={11} /> CLOSE</> : <><Maximize2 size={11} /> FULL SCREEN</>}
        </button>
      </div>
      {state === "loading" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>measuring activity…</div>}
      {state === "off" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>No archive configured on this instance.</div>}
      {state === "error" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>Activity map unavailable right now.</div>}
      <div ref={box} style={{ height: full ? "auto" : 380, flex: full ? 1 : undefined,
        borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />
      <div className="flex items-center gap-1.5 font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, flexWrap: "wrap" }}>
        <span>quiet</span>
        {HEAT_RAMP.map((r) => <span key={r.at} style={{ width: 14, height: 8, background: r.c, borderRadius: 2, display: "inline-block" }} />)}
        <span>busiest</span>
        {data && <span style={{ marginLeft: 6 }}>· {data.count} airspaces with activity in {data.windowDays}d</span>}
      </div>
      <div style={{ fontSize: 9, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>
        Each circle counts distinct aircraft seen within {(data && data.sweepRadiusNm) || 250}nm of that site — a
        region, not the airfield. Neighbouring circles overlap, and an aircraft crossing both is
        counted at whichever site it came closest to. 
        Measured from aircraft that broadcast ADS-B. Aircraft flying with transponders off — which
        includes most combat activity — are not counted, so this shows the visible traffic around a
        region, not the fighting itself.
      </div>
    </div>
  );
}

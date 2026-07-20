import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// One archived contact's recorded path on a real map, so a track reads as
// "off the coast of Cyprus" rather than an abstract line on a blank panel.
//
// fitKey identifies the contact. The view is fitted ONCE per contact: the parent
// re-renders every 30s (sweep poll), and refitting on every render would throw
// away whatever the user had panned or zoomed to.
export default function PathMap({ points, fitKey, color = "#C084FC", height = "min(55vh, 460px)" }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(null);
  const [full, setFull] = useState(false);

  // create the map once
  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,       // don't hijack page scrolling
      doubleClickZoom: true,
      minZoom: 2,
      maxZoom: 18,
    });
    Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,                  // let the user zoom to street level
      maxNativeZoom: 19,
    }).addTo(map.current);
    Leaflet.control.zoom({ position: "topright" }).addTo(map.current);
    Leaflet.control.scale({ imperial: false, position: "bottomleft" }).addTo(map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, []);

  // draw / redraw the track
  useEffect(() => {
    if (!map.current || !points || points.length === 0) return;
    if (layer.current) layer.current.remove();
    layer.current = Leaflet.layerGroup().addTo(map.current);

    const latlngs = points.map((p) => [p.lat, p.lon]);
    Leaflet.polyline(latlngs, { color, weight: 2.5, opacity: 0.9 }).addTo(layer.current);

    const first = points[0], last = points[points.length - 1];
    Leaflet.circleMarker([first.lat, first.lon], { radius: 4, color, weight: 2, fillOpacity: 0 })
      .bindTooltip(`first seen · ${new Date(first.ts).toLocaleString()}`).addTo(layer.current);
    Leaflet.circleMarker([last.lat, last.lon], { radius: 5, color, weight: 2, fillColor: color, fillOpacity: 1 })
      .bindTooltip(`last seen · ${new Date(last.ts).toLocaleString()}`).addTo(layer.current);

    // fit only when the contact changes — never on a routine re-render
    if (fitted.current !== fitKey) {
      fitted.current = fitKey;
      if (latlngs.length === 1) map.current.setView(latlngs[0], 9);
      else map.current.fitBounds(Leaflet.latLngBounds(latlngs).pad(0.25), { maxZoom: 11 });
      setTimeout(() => map.current && map.current.invalidateSize(), 60);
    }
  }, [points, color, fitKey]);

  useEffect(() => {
    if (map.current) setTimeout(() => map.current && map.current.invalidateSize(), 150);
  }, [full]);

  const shell = full
    ? { position: "fixed", inset: 0, zIndex: 1000, background: "#0A0D12", padding: 10,
        display: "flex", flexDirection: "column", gap: 6 }
    : {};

  return (
    <div style={shell}>
      <div className="flex items-center justify-end" style={{ marginBottom: 4 }}>
        <button onClick={() => setFull(!full)} className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 9, color: "#C084FC", border: "1px solid rgba(192,132,252,0.4)", background: "transparent" }}>
          {full ? <><X size={11} /> CLOSE</> : <><Maximize2 size={11} /> FULL SCREEN</>}
        </button>
      </div>
      <div ref={box} style={{ height: full ? "auto" : height, flex: full ? 1 : undefined,
        borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />
      <div className="font-mono" style={{ fontSize: 9, color: "#5B6472", marginTop: 3 }}>
        pinch or use +/− to zoom · place names appear as you zoom in
      </div>
    </div>
  );
}

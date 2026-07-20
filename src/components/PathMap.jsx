import { useEffect, useRef } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// Draws one archived contact's recorded path on a real map, so a track reads as
// "off the coast of Cyprus" rather than an abstract line on a blank panel.
export default function PathMap({ points, color = "#C084FC", height = 220 }) {
  const box = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (!box.current || !points || points.length === 0) return;
    const latlngs = points.map((p) => [p.lat, p.lon]);

    if (!map.current) {
      map.current = Leaflet.map(box.current, {
        zoomControl: true, attributionControl: true, scrollWheelZoom: false,
      });
      Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 12,
      }).addTo(map.current);
    }

    const layer = Leaflet.layerGroup().addTo(map.current);
    Leaflet.polyline(latlngs, { color, weight: 2.5, opacity: 0.9 }).addTo(layer);

    // start = hollow, end = filled, so direction of travel is obvious
    const first = points[0], last = points[points.length - 1];
    Leaflet.circleMarker([first.lat, first.lon], { radius: 4, color, weight: 2, fillOpacity: 0 })
      .bindTooltip(`first seen · ${new Date(first.ts).toLocaleString()}`).addTo(layer);
    Leaflet.circleMarker([last.lat, last.lon], { radius: 5, color, weight: 2, fillColor: color, fillOpacity: 1 })
      .bindTooltip(`last seen · ${new Date(last.ts).toLocaleString()}`).addTo(layer);

    if (latlngs.length === 1) map.current.setView(latlngs[0], 8);
    else map.current.fitBounds(Leaflet.latLngBounds(latlngs).pad(0.25));

    setTimeout(() => map.current && map.current.invalidateSize(), 60); // panel just opened
    return () => { layer.remove(); };
  }, [points, color]);

  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null; } }, []);

  return <div ref={box} style={{ height, borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />;
}

import { useEffect, useRef } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// The same contacts the radar is plotting, on real geography. The radar is better for
// "what's around me and how far"; the map is better for "where is this actually".
// Same selection state drives both, so tapping in one highlights in the other.
export default function RadarMap({ center, contacts, radiusNm, sel, onSel, height = 300 }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      zoomControl: false, scrollWheelZoom: false, attributionControl: true, minZoom: 2, maxZoom: 12,
    }).setView([center.lat, center.lng], 7);
    Leaflet.control.zoom({ position: "topright" }).addTo(map.current);
    Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 12, attribution: "&copy; OpenStreetMap &copy; CARTO",
    }).addTo(map.current);
    layer.current = Leaflet.layerGroup().addTo(map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 80);
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, [center.lat, center.lng]);

  // range ring + centre, refitted when the radius changes
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    if (m._ring) m.removeLayer(m._ring);
    if (m._hub) m.removeLayer(m._hub);
    m._ring = Leaflet.circle([center.lat, center.lng], {
      radius: radiusNm * 1852, color: "#5AC8FA", weight: 1, opacity: 0.35, fill: false, dashArray: "4 6",
    }).addTo(m);
    m._hub = Leaflet.circleMarker([center.lat, center.lng], {
      radius: 4, color: "#5AC8FA", weight: 2, fillColor: "#0A0D12", fillOpacity: 1,
    }).bindTooltip(center.name || "feed centre", { direction: "top" }).addTo(m);
    m.fitBounds(m._ring.getBounds().pad(0.05));
    fitted.current = true;
  }, [radiusNm, center.lat, center.lng, center.name]);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    (contacts || []).forEach((a) => {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return;
      const col = a.isDrone ? "#C084FC" : a.military ? "#F87171" : "#5AC8FA";
      const isSel = a.id === sel;
      const rot = Number.isFinite(a.headingDeg) ? a.headingDeg : 0;
      // a rotated chevron reads as heading at a glance — a plain dot does not
      Leaflet.marker([a.lat, a.lon], {
        icon: Leaflet.divIcon({
          className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html:
            `<div style="width:18px;height:18px;transform:rotate(${rot}deg);` +
            `display:flex;align-items:center;justify-content:center;">` +
            `<div style="width:0;height:0;border-left:5px solid transparent;` +
            `border-right:5px solid transparent;border-bottom:12px solid ${col};` +
            `${isSel ? "filter:drop-shadow(0 0 3px #fff);" : ""}opacity:${isSel ? 1 : 0.85};"></div></div>`,
        }),
        zIndexOffset: isSel ? 1000 : 0,
      })
        .bindTooltip(
          `${a.callsign || a.id}${a.military ? " · MIL" : ""}${a.isDrone ? " · UAV" : ""}` +
          `${Number.isFinite(a.altFt) ? " · " + Math.round(a.altFt / 1000) + "k ft" : ""}`,
          { direction: "top", opacity: 0.9 }
        )
        .on("click", () => onSel && onSel(a.id))
        .addTo(layer.current);

      if (isSel && a.trail && a.trail.length > 1) {
        Leaflet.polyline(a.trail, { color: col, weight: 1.5, opacity: 0.6 }).addTo(layer.current);
      }
    });
  }, [contacts, sel, onSel]);

  return <div ref={box} style={{ height, borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />;
}

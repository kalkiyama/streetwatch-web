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
  const trailRef = useRef(null);
  const onSelRef = useRef(onSel);
  onSelRef.current = onSel;

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      zoomControl: false, scrollWheelZoom: false, attributionControl: true, minZoom: 2, maxZoom: 12,
    }).setView([center.lat, center.lng], 7);
    Leaflet.control.zoom({ position: "bottomright" }).addTo(map.current);   // top-right is occupied by the radar header
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

  // Reuse markers instead of clearing and rebuilding them.
  //
  // The radar re-renders continuously to animate its sweep, so this component receives a new
  // `contacts` array many times a second. Clearing the layer each time destroyed and recreated
  // every marker — which meant a tap landing between two frames hit a marker that no longer
  // existed, and clicks were routinely lost. Now each aircraft keeps one marker for its
  // lifetime and we only move it.
  const markers = useRef(new Map());

  const iconFor = (a, isSel) => {
    const col = a.isDrone ? "#C084FC" : a.military ? "#F87171" : "#5AC8FA";
    const rot = Number.isFinite(a.headingDeg) ? a.headingDeg : 0;
    return Leaflet.divIcon({
      className: "", iconSize: [18, 18], iconAnchor: [9, 9],
      html:
        `<div style="width:18px;height:18px;transform:rotate(${rot}deg);` +
        `display:flex;align-items:center;justify-content:center;">` +
        `<div style="width:0;height:0;border-left:5px solid transparent;` +
        `border-right:5px solid transparent;border-bottom:12px solid ${col};` +
        `${isSel ? "filter:drop-shadow(0 0 3px #fff);" : ""}opacity:${isSel ? 1 : 0.85};"></div></div>`,
    });
  };

  useEffect(() => {
    if (!map.current || !layer.current) return;
    const live = new Set();

    (contacts || []).forEach((a) => {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return;
      live.add(a.id);
      const isSel = a.id === sel;
      const key = `${Math.round((a.headingDeg || 0) / 5)}|${isSel}|${a.isDrone}|${a.military}`;
      let m = markers.current.get(a.id);

      if (!m) {
        m = Leaflet.marker([a.lat, a.lon], { icon: iconFor(a, isSel), zIndexOffset: isSel ? 1000 : 0 });
        m._key = key;
        m.on("click", () => onSelRef.current && onSelRef.current(a.id));
        m.addTo(layer.current);
        markers.current.set(a.id, m);
      } else {
        m.setLatLng([a.lat, a.lon]);
        if (m._key !== key) {           // only rebuild the icon when it would actually differ
          m.setIcon(iconFor(a, isSel));
          m.setZIndexOffset(isSel ? 1000 : 0);
          m._key = key;
        }
      }
      m.bindTooltip(
        `${a.callsign || a.id}${a.military ? " · MIL" : ""}${a.isDrone ? " · UAV" : ""}` +
        `${Number.isFinite(a.altFt) ? " · " + Math.round(a.altFt / 1000) + "k ft" : ""}`,
        { direction: "top", opacity: 0.9 }
      );
    });

    // drop markers for contacts that have gone
    markers.current.forEach((m, id) => {
      if (!live.has(id)) { layer.current.removeLayer(m); markers.current.delete(id); }
    });

    // trail for the selected contact only
    if (trailRef.current) { layer.current.removeLayer(trailRef.current); trailRef.current = null; }
    const chosen = (contacts || []).find((a) => a.id === sel);
    if (chosen && chosen.trail && chosen.trail.length > 1) {
      const col = chosen.isDrone ? "#C084FC" : chosen.military ? "#F87171" : "#5AC8FA";
      trailRef.current = Leaflet.polyline(chosen.trail, { color: col, weight: 1.5, opacity: 0.6 }).addTo(layer.current);
    }
  }, [contacts, sel]);

  return <div ref={box} style={{ height, borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />;
}

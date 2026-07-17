import { useEffect, useRef } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { LAYERS } from "../theme.js";

export default function WorldMap({ feeds, selectedId, onSelect }) {
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


import { useEffect, useRef, useState } from "react";
import { Maximize2, X, Play, Pause, SkipBack } from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { guardTouchScroll } from "./mapTouch.js";

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
  // timeline scrubber: how much of the track to reveal, and whether it's playing
  const [upto, setUpto] = useState(null);        // null = show the whole track
  const [playing, setPlaying] = useState(false);

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
    guardTouchScroll(map.current);
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

  // re-measure whenever the frame size changes (entering AND leaving fullscreen)
  useEffect(() => { const t = setTimeout(() => map.current && map.current.invalidateSize(), 90); return () => clearTimeout(t); }, [full]);

  const shown = upto === null ? points : points.slice(0, Math.max(upto + 1, 2));
  const head = shown && shown.length ? shown[shown.length - 1] : null;

  // draw / redraw the track
  useEffect(() => {
    if (!map.current || !points || points.length === 0) return;
    if (layer.current) layer.current.remove();
    layer.current = Leaflet.layerGroup().addTo(map.current);

    const latlngs = points.map((p) => [p.lat, p.lon]);
    const shownLL = shown.map((p) => [p.lat, p.lon]);
    // whole track stays faintly visible so the scrubbed portion has context
    if (upto !== null) Leaflet.polyline(latlngs, { color, weight: 1.5, opacity: 0.22 }).addTo(layer.current);
    Leaflet.polyline(shownLL, { color, weight: 2.5, opacity: 0.9 }).addTo(layer.current);
    if (upto !== null && head) {
      Leaflet.circleMarker([head.lat, head.lon], {
        radius: 6, color: "#FFFFFF", weight: 2, fillColor: color, fillOpacity: 1,
      }).bindTooltip(new Date(head.ts).toLocaleString(), { permanent: false }).addTo(layer.current);
    }

    const first = points[0], last = points[points.length - 1];
    Leaflet.circleMarker([first.lat, first.lon], { radius: 4, color, weight: 2, fillOpacity: 0 })
      .bindTooltip(`first seen · ${new Date(first.ts).toLocaleString()}`).addTo(layer.current);
    Leaflet.circleMarker([last.lat, last.lon], { radius: 5, color, weight: 2, fillColor: color, fillOpacity: 1 })
      .bindTooltip(`last seen · ${new Date(last.ts).toLocaleString()}`).addTo(layer.current);

    // fit only when the contact changes — never on a routine re-render
    if (fitted.current !== fitKey) {
      setUpto(null); setPlaying(false);
      fitted.current = fitKey;
      if (latlngs.length === 1) map.current.setView(latlngs[0], 9);
      else map.current.fitBounds(Leaflet.latLngBounds(latlngs).pad(0.25), { maxZoom: 11 });
      setTimeout(() => map.current && map.current.invalidateSize(), 60);
    }
  }, [points, shown, head, upto, color, fitKey]);

  useEffect(() => {
    if (map.current) setTimeout(() => map.current && map.current.invalidateSize(), 150);
  }, [full]);

  const shell = full
    ? { position: "fixed", inset: 0, zIndex: 1000, background: "#0A0D12", padding: 10,
        display: "flex", flexDirection: "column", gap: 6 }
    : {};

  useEffect(() => {
    if (!playing || !points || points.length < 2) return;
    const id = setInterval(() => {
      setUpto((u) => {
        const next = (u === null ? 0 : u) + 1;
        if (next >= points.length - 1) { setPlaying(false); return null; }   // finished -> whole track
        return next;
      });
    }, 220);
    return () => clearInterval(id);
  }, [playing, points]);

  return (
    <div style={shell}>
      <div className="flex items-center justify-end" style={{ marginBottom: 4 }}>
        <button onClick={() => setFull(!full)} className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 9, color: "#C084FC", border: "1px solid rgba(192,132,252,0.4)", background: "transparent" }}>
          {full ? <><X size={11} /> CLOSE</> : <><Maximize2 size={11} /> FULL SCREEN</>}
        </button>
      </div>
      {points && points.length < 2 && (
        <div className="font-mono" style={{ fontSize: 9, color: "#5B6472", marginTop: 4 }}>
          only {points.length} observation recorded — not enough to replay
        </div>
      )}
      {points && points.length >= 2 && (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => { setPlaying(!playing); if (upto === null) setUpto(0); }}
            title={playing ? "Pause" : "Play the track through"}
            className="flex items-center justify-center rounded"
            style={{ width: 28, height: 28, flexShrink: 0, background: "rgba(192,132,252,0.12)",
                     border: "1px solid rgba(192,132,252,0.4)", color: "#C084FC" }}>
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button onClick={() => { setPlaying(false); setUpto(null); }}
            title="Show the whole track"
            className="flex items-center justify-center rounded"
            style={{ width: 28, height: 28, flexShrink: 0, background: "transparent",
                     border: "1px solid rgba(255,255,255,0.15)", color: "#8A93A6" }}>
            <SkipBack size={13} />
          </button>
          <input type="range" min={0} max={points.length - 1}
            value={upto === null ? points.length - 1 : upto}
            onChange={(e) => { setPlaying(false); const v = Number(e.target.value);
              setUpto(v >= points.length - 1 ? null : v); }}
            style={{ flex: 1, accentColor: "#C084FC", height: 20 }} />
          <span className="font-mono" style={{ fontSize: 9, color: "#8A93A6", minWidth: 118, textAlign: "right" }}>
            {head ? new Date(head.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        </div>
      )}
      <div ref={box} style={{ height: full ? "auto" : height, flex: full ? 1 : undefined,
        borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />
      <div className="font-mono" style={{ fontSize: 9, color: "#5B6472", marginTop: 3 }}>
        pinch or use +/− to zoom · drag the slider or press play to replay the track
      </div>
    </div>
  );
}

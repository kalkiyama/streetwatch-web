import { useEffect, useRef, useCallback } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { LAYERS } from "../theme.js";

// Viewport clustering, no extra dependency.
//
// 7,326 individual markers is far too many for Leaflet to draw smoothly, and the previous
// workaround — hiding everything except "major" feeds past 2,000 — meant most of the
// catalogue simply wasn't on the map. Instead: only consider feeds inside the current
// view, and below a zoom threshold collapse them into grid cells showing a count.
const DETAIL_ZOOM = 8;        // at or beyond this, draw individual feeds
const CELL_PX = 64;           // approximate cluster cell size on screen

export default function WorldMap({ feeds, selectedId, onSelect, onOpenSighting, onOpenVessel, liveContacts = null, heatSites = null, usvContacts = null, subContacts = null, showFeeds = true }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const liveRef = useRef(liveContacts);
  liveRef.current = liveContacts;
  const heatRef = useRef(heatSites);
  heatRef.current = heatSites;
  const showFeedsRef = useRef(showFeeds);
  showFeedsRef.current = showFeeds;
  const usvRef = useRef(usvContacts);
  usvRef.current = usvContacts;
  const subRef = useRef(subContacts);
  subRef.current = subContacts;
  const onOpenVesselRef = useRef(onOpenVessel);
  onOpenVesselRef.current = onOpenVessel;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;
  const centred = useRef(null);     // which feed the map is already centred on


  // --- activity heat: measured contact density per airspace, drawn beneath everything ---
  const drawHeat = (lg) => {
    const sites = heatRef.current;
    if (!sites || !sites.length) return;
    const RAMP = ["#3B82F6", "#8B5CF6", "#C084FC", "#F6A821", "#F87171"];
    sites.forEach((s) => {
      const col = RAMP[Math.min(RAMP.length - 1, Math.floor(s.intensity * RAMP.length))];
      Leaflet.circleMarker([s.lat, s.lon], {
        radius: 6 + s.intensity * 18, color: col, weight: 1.2,
        fillColor: col, fillOpacity: 0.22, interactive: true,
      })
        .bindPopup(
          `<b>${s.site}</b><br>${s.country || ""}<br>` +
          `${s.contacts} contacts · ${s.uav} UAV · ${s.military} military<br>` +
          `${s.points} observations over ${s.span_hours || 0}h`
        )
        .addTo(lg);
    });
  };

  // --- live sweep contacts, drawn on top so they are never hidden ---
  const drawLive = (lg, onSelectFeed, onOpenSighting) => {
    const items = liveRef.current;
    if (!items || !items.length) return;
    items.forEach((d) => {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return;
      const col = d.kind === "uav" ? "#C084FC" : "#F6A821";
      const disputed = d.confidence === "disputed";
      Leaflet.circleMarker([d.lat, d.lon], {
        radius: 5, color: col, weight: 2,
        fillColor: col, fillOpacity: disputed ? 0.15 : 0.85,
      })
        .bindTooltip(
          `${d.callsign || d.id} — ${disputed ? "UAV?" : d.kind === "uav" ? "UAV" : "military"}` +
          `${d.site ? " · " + d.site : ""}`,
          { direction: "top", opacity: 0.9 }
        )
        .on("click", function () {
          // Open the airspace radar AND pre-select this aircraft, so the user lands on the
          // contact they tapped rather than hunting for it among a hundred other flights.
          if (onOpenSighting) { onOpenSighting(d); return; }
          const f = feedsRef.current.find((x) => x.tag === "uav" && d.site && x.name.endsWith(d.site));
          if (f && onSelectFeed) { onSelectFeed(f.id); return; }
          // never leave a tap doing nothing: explain instead
          this.bindPopup(
            `<b>${d.callsign || d.id}</b><br>${disputed ? "disputed UAV" : d.kind}<br>` +
            `${d.site ? d.site + "<br>" : ""}` +
            `<span style="opacity:.7">no radar feed matched this airspace</span>`
          ).openPopup();
        })
        .addTo(lg);
    });
  };



  // A tap must always do something. For a vessel, "something" is the same promise the
  // live-drone layer makes: open the radar that can show it, with it selected. If no
  // marine feed is close enough for its radar to plot the vessel, say so in a popup
  // rather than silently ignoring the tap.
  const openVessel = (marker, v, kindLabel) => {
    const feeds = feedsRef.current;
    let best = null, bestNm = Infinity;
    feeds.forEach((f) => {
      if (f.layer !== "marine") return;
      const dNm = Math.hypot((f.lat - v.lat) * 60, (f.lng - v.lon) * 60 * Math.cos(v.lat * Math.PI / 180));
      if (dNm < bestNm) { bestNm = dNm; best = f; }
    });
    if (best && bestNm <= 100 && onOpenVesselRef.current) {
      onOpenVesselRef.current({ feedId: best.id, vesselId: v.id });
      return;
    }
    marker.bindPopup(
      `<b>${v.name || v.id}</b><br>${kindLabel}` +
      `${Number.isFinite(v.sogKt) ? "<br>" + v.sogKt.toFixed(1) + " kt" : ""}` +
      `${Number.isFinite(v.lengthM) ? " · " + Math.round(v.lengthM) + " m" : ""}` +
      `${v.provider ? "<br>via " + v.provider : ""}` +
      `<br><span style="opacity:.7">${best ? "nearest marine radar (" + best.name + ") is " + Math.round(bestNm) + "nm away — too far to plot this vessel" : "no marine radar feed in the current filter"}</span>`
    ).openPopup();
  };

  // --- sea drones: hollow rings echo the marine layer's port styling ---
  const drawUsv = (lg) => {
    const items = usvRef.current;
    if (!items || !items.length) return;
    items.forEach((v) => {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return;
      const confirmed = v.usvConfidence === "confirmed";
      const col = confirmed ? "#2DD4BF" : "#7AA2C8";
      Leaflet.circleMarker([v.lat, v.lon], {
        radius: confirmed ? 6 : 5, color: col, weight: 2,
        fillColor: col, fillOpacity: confirmed ? 0.25 : 0.08,
      })
        .on("click", function () { openVessel(this, v, confirmed ? "sea drone (identified fleet)" : "possible sea drone — small unidentified hull"); })
        .bindTooltip(
          `${v.name || v.id} — ${confirmed ? "sea drone" : "possible sea drone"}` +
          `${Number.isFinite(v.sogKt) ? " · " + v.sogKt.toFixed(1) + "kt" : ""}` +
          `${Number.isFinite(v.lengthM) ? " · " + Math.round(v.lengthM) + "m" : ""}`,
          { direction: "top", opacity: 0.9 }
        )
        .addTo(lg);
    });
  };


  // --- submarine SUPPORT vessels: surface ships, never submarines themselves ---
  const drawSub = (lg) => {
    const items = subRef.current;
    if (!items || !items.length) return;
    items.forEach((v) => {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return;
      const named = v.subSupportConfidence === "named";
      const col = "#F0553B";
      Leaflet.circleMarker([v.lat, v.lon], {
        radius: named ? 6 : 5, color: col, weight: named ? 2 : 1.4,
        fillColor: col, fillOpacity: named ? 0.3 : 0.1, dashArray: named ? null : "3 3",
      })
        .on("click", function () { openVessel(this, v, "submarine SUPPORT vessel — surface ship, not a submarine"); })
        .bindTooltip(
          `${v.name || v.id} — submarine SUPPORT vessel (${named ? "identified" : "possible"})` +
          `${Number.isFinite(v.lengthM) ? " · " + Math.round(v.lengthM) + "m" : ""}` +
          `<br><i>surface ship — not a submarine</i>`,
          { direction: "top", opacity: 0.9 }
        )
        .addTo(lg);
    });
  };

  const draw = useCallback(() => {
    const map = mapRef.current, lg = layerRef.current;
    if (!map || !lg) return;
    lg.clearLayers();
    drawHeat(lg);
    drawUsv(lg);
    drawSub(lg);

    const zoom = map.getZoom();
    const bounds = map.getBounds().pad(0.2);
    if (!showFeedsRef.current) { drawLive(lg, onSelect, onOpenSighting); return; }   // heat already drawn
    const visible = feedsRef.current.filter(
      (f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && bounds.contains([f.lat, f.lng])
    );

    // close in: individual feeds
    if (zoom >= DETAIL_ZOOM || visible.length <= 120) {
      visible.forEach((f) => {
        const col = LAYERS[f.layer].color, sel = f.id === selectedId;
        const hollow = f.layer === "marine";        // ports read as rings, airports as dots
        Leaflet.circleMarker([f.lat, f.lng], {
          radius: sel ? 7 : hollow ? 4.5 : 4, color: sel ? "#FFFFFF" : col,
          weight: sel ? 2 : hollow ? 1.8 : 1,
          fillColor: col, fillOpacity: hollow ? 0.12 : 0.9,
        })
          .on("click", () => onSelect(f.id))
          .bindTooltip(f.name, { direction: "top", opacity: 0.9 })
          .addTo(lg);
      });
      drawLive(lg, onSelect, onOpenSighting);
      return;
    }

    // zoomed out: bucket into grid cells sized in degrees to match CELL_PX on screen
    const nw = map.containerPointToLatLng([0, 0]);
    const se = map.containerPointToLatLng([map.getSize().x, map.getSize().y]);
    const degPerPxX = Math.abs(se.lng - nw.lng) / Math.max(map.getSize().x, 1);
    const degPerPxY = Math.abs(nw.lat - se.lat) / Math.max(map.getSize().y, 1);
    const cellX = Math.max(degPerPxX * CELL_PX, 0.02);
    const cellY = Math.max(degPerPxY * CELL_PX, 0.02);

    const cells = new Map();
    visible.forEach((f) => {
      const key = Math.floor(f.lng / cellX) + ":" + Math.floor(f.lat / cellY);
      let c = cells.get(key);
      if (!c) { c = { n: 0, lat: 0, lng: 0, layers: {} }; cells.set(key, c); }
      c.n++; c.lat += f.lat; c.lng += f.lng;
      c.layers[f.layer] = (c.layers[f.layer] || 0) + 1;
      if (!c.one) c.one = f;
    });

    cells.forEach((c) => {
      const lat = c.lat / c.n, lng = c.lng / c.n;
      if (c.n === 1) {
        const f = c.one, col = LAYERS[f.layer].color, sel = f.id === selectedId;
        const hollow = f.layer === "marine";
        Leaflet.circleMarker([f.lat, f.lng], {
          radius: sel ? 7 : hollow ? 4.5 : 4, color: sel ? "#FFFFFF" : col,
          weight: sel ? 2 : hollow ? 1.8 : 1,
          fillColor: col, fillOpacity: hollow ? 0.12 : 0.9,
        })
          .on("click", () => onSelect(f.id))
          .bindTooltip(f.name, { direction: "top", opacity: 0.9 })
          .addTo(lg);
        return;
      }
      // colour the cluster by whichever layer dominates it
      const top = Object.entries(c.layers).sort((a, b) => b[1] - a[1])[0][0];
      const col = LAYERS[top].color;
      const size = c.n > 999 ? 44 : c.n > 99 ? 38 : c.n > 9 ? 32 : 26;
      const label = c.n > 999 ? Math.round(c.n / 1000) + "k" : String(c.n);
      Leaflet.marker([lat, lng], {
        icon: Leaflet.divIcon({
          className: "",
          iconSize: [size, size],
          html:
            `<div style="width:${size}px;height:${size}px;border-radius:50%;` +
            `background:${col}22;border:1.5px solid ${col};color:#E6EAF2;` +
            `display:flex;align-items:center;justify-content:center;` +
            `font:600 ${c.n > 999 ? 11 : 12}px ui-monospace,monospace;">${label}</div>`,
        }),
      })
        // setView, not flyTo — flyTo traces a parabola that zooms OUT before zooming in,
        // which reads as a glitch when you're just drilling into a cluster
        .on("click", () => map.setView([lat, lng], Math.min(zoom + 3, 12), { animate: true, duration: 0.5 }))
        .bindTooltip(`${c.n} feeds — tap to zoom in`, { direction: "top", opacity: 0.9 })
        .addTo(lg);
    });
    drawLive(lg, onSelect, onOpenSighting);
  }, [selectedId, onSelect, onOpenSighting]);

  // The map must be created ONCE. Depending on `draw` here re-created it on every parent
  // render (draw's identity changes because onSelect/onOpenSighting are new functions each
  // time), which destroyed and rebuilt the map — the "flicker" and the snap back to the
  // default centre [20,0] off West Africa, with panning and zooming impossible.
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    try {
      // If a feed is already selected when this map mounts — which is exactly what happens
      // when the feed viewer opens its own map instance — start ON that feed. Starting at
      // world view and then jumping looks like the map is zooming out and back in.
      const start = feedsRef.current.find((x) => x.id === selRef.current);
      if (start) centred.current = start.id;
      const map = Leaflet.map(elRef.current, {
        center: start ? [start.lat, start.lng] : [20, 0],
        zoom: start ? 7 : 2,
        worldCopyJump: true, preferCanvas: true,
        zoomControl: false, minZoom: 1,
      });
      Leaflet.control.zoom({ position: "topright" }).addTo(map);
      Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap, &copy; CARTO",
      }).addTo(map);
      layerRef.current = Leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("moveend zoomend", () => drawRef.current());
      setTimeout(() => { try { map.invalidateSize(); draw(); } catch { /* not mounted */ } }, 200);
    } catch { /* leaflet unavailable */ }
    return () => {
      try {
        if (mapRef.current) { mapRef.current.off("moveend zoomend"); mapRef.current.remove(); mapRef.current = null; }
      } catch { /* already gone */ }
    };
  }, []);

  // redraw when the DATA changes — not when a parent re-render hands us new function
  // identities, which would clear and rebuild every marker for no reason
  useEffect(() => { drawRef.current(); }, [feeds, selectedId, liveContacts, heatSites, showFeeds]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !selectedId) return;
    if (centred.current === selectedId) return;      // already looking at it
    centred.current = selectedId;
    const f = feedsRef.current.find((x) => x.id === selectedId);
    // same reason as the cluster handler: flyTo arcs outward first, which looks like the map
    // is throwing you away before it brings you back. Also: never zoom OUT on selection —
    // if the user has already zoomed in past 5, respect where they are.
    if (f) map.setView([f.lat, f.lng], Math.max(map.getZoom(), 5), { animate: true, duration: 0.6 });
  }, [selectedId]);

  return <div ref={elRef} style={{ width: "100%", height: "100%", background: "#0B0E13" }} />;
}

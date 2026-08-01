import { useEffect, useRef, useCallback, useState } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { guardTouchScroll } from "./mapTouch.js";
import { LAYERS, heatColor, heatIntensity, addBaseTiles } from "../theme.js";
import { droneIcon, stationIcon } from "../mapIcons.js";
import { watchUserPan, keepInView } from "../mapFollow.js";

// Viewport clustering, no extra dependency.
//
// 7,326 individual markers is far too many for Leaflet to draw smoothly, and the previous
// workaround — hiding everything except "major" feeds past 2,000 — meant most of the
// catalogue simply wasn't on the map. Instead: only consider feeds inside the current
// view, and below a zoom threshold collapse them into grid cells showing a count.
const DETAIL_ZOOM = 8;        // at or beyond this, draw individual feeds
const CELL_PX = 64;           // approximate cluster cell size on screen

export default function WorldMap({ feeds, selectedId, onSelect, onOpenSighting, onOpenVessel, liveContacts = null, heatSites = null, heatRadius = 250, heatMeta = null, userLoc = null, usvContacts = null, subContacts = null, showFeeds = true, showIss = true, advisories = null,
  // Added Aug 1 so HeatMap can delegate its map here instead of running a second Leaflet
  // instance. Defaults are WorldMap's existing behaviour, so no existing caller changes.
  // scrollWheelZoom MATTERS: the activity map sits in a scrolling panel and wheel-zoom
  // there hijacks the page scroll. It is off for that caller and on for this one.
  scrollWheelZoom = true, maxZoom = undefined, initialView = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const roRef = useRef(null);
  const advLayerRef = useRef(null);
  const advisoriesRef = useRef(advisories);
  advisoriesRef.current = advisories;
  const issMarkerRef = useRef(null);
  const [issPos, setIssPos] = useState(null);
  const showIssRef = useRef(showIss);
  showIssRef.current = showIss;

  // Live ISS position — same public API the orbital tracker uses. Polled every 5s; the marker
  // below moves to the new spot each time. No fixed catalogue coordinate is ever invented.
  useEffect(() => {
    if (!showIss) return;   // ISS marker is world-tab only
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Number.isFinite(j.latitude) && Number.isFinite(j.longitude)) {
          setIssPos({ lat: j.latitude, lon: j.longitude });
        }
      } catch { /* offline: simply no ISS dot, rather than a wrong one */ }
    };
    pull();
    const id = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [showIss]);

  // Draw or move the live ISS marker. A distinct pink diamond so it never reads as a ground feed;
  // clicking it selects the ISS feed (which opens the full orbital tracker).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showIss) {                      // tab hides the ISS: remove any existing marker
      if (issMarkerRef.current) { issMarkerRef.current.remove(); issMarkerRef.current = null; }
      return;
    }
    if (!issPos) return;
    const L = Leaflet;
    if (!issMarkerRef.current) {
      issMarkerRef.current = L.marker([issPos.lat, issPos.lon], {
        icon: stationIcon(L, { color: "#F472B6", size: 24 }),
        interactive: true, keyboard: false, zIndexOffset: 1000,
      })
        .bindTooltip("ISS · live position", { direction: "top", opacity: 0.9 })
        .addTo(map)
        .on("click", () => onSelectRef.current && onSelectRef.current("S-ISS"));
    } else {
      issMarkerRef.current.setLatLng([issPos.lat, issPos.lon]);
      if (selRef.current === "S-ISS") keepInView(map, [issPos.lat, issPos.lon]);
    }
  }, [issPos, showIss]);
  const layerRef = useRef(null);
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const liveRef = useRef(liveContacts);
  liveRef.current = liveContacts;
  // Read through refs: the map is created ONCE in an effect with an empty dependency array,
  // so these cannot be closed over directly without either re-creating the map on every
  // prop change or reading a stale value. Same pattern as heatRef below.
  const scrollWheelRef = useRef(scrollWheelZoom); scrollWheelRef.current = scrollWheelZoom;
  const maxZoomRef = useRef(maxZoom); maxZoomRef.current = maxZoom;
  const initialViewRef = useRef(initialView); initialViewRef.current = initialView;
  // Set when a redraw was skipped because a popup was open; flushed on popupclose so the map
  // never silently stays stale after the user dismisses a popup.
  const pendingDraw = useRef(false);
  const heatRef = useRef(heatSites);
  heatRef.current = heatSites;
  // Radius + per-radius maxima, so this layer answers the same question as the standalone
  // Activity map. Previously it was locked at 250nm — the one radius that makes a dormant
  // base look busy.
  // Recentre on the user when "near me" turns on, and drop a marker so it is obvious where
  // "near" is measured from. Runs on change of location only — never fights manual panning.
  const lastUserLoc = useRef(null);
  const userMarker = useRef(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !userLoc) {
      if (!userLoc && userMarker.current) { userMarker.current.remove(); userMarker.current = null; }
      return;
    }
    const key = `${userLoc.lat.toFixed(4)},${userLoc.lng.toFixed(4)}`;
    if (lastUserLoc.current !== key) {
      lastUserLoc.current = key;
      m.setView([userLoc.lat, userLoc.lng], Math.max(m.getZoom(), 7), { animate: true });
    }
    if (userMarker.current) userMarker.current.setLatLng([userLoc.lat, userLoc.lng]);
    else {
      userMarker.current = Leaflet.circleMarker([userLoc.lat, userLoc.lng], {
        radius: 7, color: "#37C46A", weight: 2, fillColor: "#37C46A", fillOpacity: 0.35,
      }).bindTooltip("You are here", { direction: "top" }).addTo(m);
    }
  }, [userLoc]);

  const heatRadiusRef = useRef(heatRadius);
  heatRadiusRef.current = heatRadius;
  const heatMetaRef = useRef(heatMeta);
  heatMetaRef.current = heatMeta;
  const showFeedsRef = useRef(showFeeds);
  showFeedsRef.current = showFeeds;
  const usvRef = useRef(usvContacts);
  usvRef.current = usvContacts;
  const subRef = useRef(subContacts);
  subRef.current = subContacts;
  const onOpenVesselRef = useRef(onOpenVessel);
  onOpenVesselRef.current = onOpenVessel;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;
  const centred = useRef(null);     // which feed the map is already centred on


  // --- conflict-zone airspace advisories: official publications, drawn beneath everything ---
  // Rendered as a hatched region rather than a solid "closed" block, because that is what the
  // data is: an advisory issued BY an authority TO the operators it regulates, over an APPROXIMATE
  // area. A solid red polygon labelled CLOSED would assert two things the source does not say.
  const drawAdvisories = (lg) => {
    const list = advisoriesRef.current;
    if (!list || !list.length) return;
    list.forEach((a) => {
      if (!a.box) return;
      Leaflet.rectangle(a.box, {
        color: "#F0553B", weight: 1, dashArray: "5 4", fillColor: "#F0553B", fillOpacity: 0.07,
      })
        .bindPopup(
          `<b>${a.region}</b><br><span style="opacity:.75">${a.fir || ""}</span>` +
          `<table style="margin-top:6px;font-size:11px;border-collapse:collapse">` +
          `<tr><td style="padding:1px 8px 1px 0;opacity:.6">Applies to</td><td><b>${a.appliesTo === "civil" ? "CIVIL aviation" : a.appliesTo}</b></td></tr>` +
          `<tr><td style="padding:1px 8px 1px 0;opacity:.6">Binding on</td><td>${a.bindingOn}</td></tr>` +
          `<tr><td style="padding:1px 8px 1px 0;opacity:.6">Reason</td><td>${a.reason}</td></tr>` +
          `<tr><td style="padding:1px 8px 1px 0;opacity:.6">Authority</td><td>${a.authority}</td></tr>` +
          `</table>` +
          `<div style="margin-top:6px;font-size:10px;opacity:.7;line-height:1.4">` +
          `Does NOT close the airspace to the overflown state's own aircraft, and does not bind ` +
          `military flights. Area shown is approximate — the source document is authoritative.` +
          (a.sourceChangedSinceCompiled ? `<br><b style="color:#F6A821">Source document has changed since this entry was compiled — verify.</b>` : "") +
          `<br><a href="${a.source}" target="_blank" rel="noopener noreferrer" style="color:#37C46A">official source ↗</a>` +
          `<br><b>NOT FOR FLIGHT PLANNING.</b></div>`
        )
        .addTo(lg);
    });
  };

  // Advisories live in their own layer group and are rebuilt ONLY when the data or the toggle
  // changes — never on the live-data redraw cycle. Otherwise an open popup is destroyed with its
  // rectangle a moment after it opens, which is exactly what "the banner disappears immediately"
  // was: the click worked every time; the shape underneath it did not survive.
  useEffect(() => {
    const lg = advLayerRef.current;
    if (!lg) return;
    lg.clearLayers();
    drawAdvisories(lg);
  }, [advisories]);

  // Follow the selected live contact. Selecting centres the map once; without this the aircraft
  // then flies off the edge and the one thing you asked to watch is the one you cannot see.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const hit = (liveContacts || []).find((d) => d.id === selectedId)
      || (usvContacts || []).find((v) => v.id === selectedId)
      || (subContacts || []).find((v) => v.id === selectedId);
    if (hit) keepInView(map, [hit.lat, hit.lon]);
  }, [liveContacts, usvContacts, subContacts, selectedId]);

  // --- activity heat: measured contact density per airspace, drawn beneath everything ---
  // PORTED FROM HeatMap Jul 31. This function and HeatMap.jsx were two implementations of the
  // same circles and they had drifted: this copy did not support the "field" radius at all, so
  // selecting AT FIELD here silently drew and reported the 250nm REGIONAL count — a wrong number
  // with nothing to indicate it. It also still carried the pre-Jul-31 popup, which showed all
  // four figures and four sentences of disclaimer.
  const drawHeat = (lg) => {
    const sites = heatRef.current;
    if (!sites || !sites.length) return;
    const rNm = heatRadiusRef.current || 250;
    const meta = heatMetaRef.current;

    // "field" is a KEY, not a distance — it means within 10nm AND below 4,000ft. Treating it as a
    // number is what made the old version fall through to the regional count.
    const pickOf = (s) =>
      rNm === "field" ? { c: s.terminal_contacts, u: null, m: null, p: s.terminal_points }
      : rNm === 25    ? { c: s.c25,  u: s.uav25,  m: s.mil25,   p: s.p25 }
      : rNm === 100   ? { c: s.c100, u: s.uav100, m: s.mil100,  p: s.p100 }
      :                 { c: s.contacts, u: s.uav, m: s.military, p: s.points };

    const maxAt = (meta && meta.maxByRadius && meta.maxByRadius[rNm])
      || Math.max(2, ...sites.map((x) => (pickOf(x).c ?? x.contacts) || 0));

    sites.forEach((s) => {
      const pick = pickOf(s);
      const shown = pick.c == null ? s.contacts : pick.c;
      const t = heatIntensity(shown, maxAt);
      const col = heatColor(t);
      Leaflet.circleMarker([s.lat, s.lon], {
        radius: 5 + t * 16,
        color: col, weight: 1.5, fillColor: col, fillOpacity: 0.35,
        interactive: true,
      })
        .bindPopup((() => {
          // ONE FIGURE — the one the radius selector asked for. Showing all four is what forced
          // four sentences of disclaimer explaining which was which.
          const label = rNm === "field" ? "Low and close"
                      : rNm === 250 ? "Full sweep" : `Within ${rNm}nm`;
          const scope = rNm === "field" ? "within 10nm and below 4,000ft"
                      : rNm === 250 ? "within 250nm — the whole polling radius, not this airfield"
                      : `within ${rNm}nm, any altitude`;
          const row = (l, v, lead) =>
            `<tr><td style="padding:${lead ? 3 : 1}px 8px ${lead ? 3 : 1}px 0;opacity:${lead ? 0.95 : 0.6};` +
            `white-space:nowrap;${lead ? "color:#C084FC;" : ""}">${l}</td>` +
            `<td style="padding:${lead ? 3 : 1}px 0;font-weight:${lead ? 700 : 400};` +
            `${lead ? "color:#C084FC;font-size:12px;" : ""}">${v}</td></tr>`;

          const rows = [];
          if (shown != null)
            rows.push(row(label, `${shown} military/UAV${pick.u ? ` (${pick.u} UAV)` : ""}`, true));
          if (pick.p != null)
            rows.push(row("Sightings",
              `${pick.p} report${pick.p === 1 ? "" : "s"} of those ${shown} aircraft` +
              ` &middot; over ${s.span_hours || 0}h`, false));
          if (s.last_seen)
            rows.push(row("Last seen", new Date(s.last_seen).toLocaleString(), false));

          return (
            `<b>${s.site}</b><br><span style="opacity:.7">${s.country || ""}</span>` +
            (s.nearestAirfield ? `<div style="margin-top:2px;font-size:10px;opacity:.6">near ${s.nearestAirfield}</div>` : "") +
            `<table style="margin-top:6px;font-size:11px;border-collapse:collapse">${rows.join("")}</table>` +
            // A WARNING, not a caveat: it says THIS NUMBER MAY BE WRONG, which is a different kind
            // of statement from explaining what a number means. Kept at full strength.
            (s.nearbySites && s.nearbySites.length
              ? `<div style="margin-top:6px;font-size:10px;line-height:1.45;color:#F6A821">` +
                `&#9888; ${s.nearbySites.map((x) => `${x.site} is ${x.nm}nm away`).join("; ")} &mdash; ` +
                `a contact counted here could have been operating there.</div>`
              : "") +
            `<div style="margin-top:6px;opacity:.6;font-size:10px;line-height:1.4">` +
            `${scope} &middot; military and UAV only &middot; positions, not landings</div>`
          );
        })())
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
      const hdg = Number.isFinite(d.track) ? d.track : (Number.isFinite(d.heading) ? d.heading : 0);
      Leaflet.marker([d.lat, d.lon], {
        icon: droneIcon(Leaflet, { heading: hdg, color: col, size: 18, faint: disputed,
          selected: d.id === selRef.current, estimated: !!d.posComputed }),
        interactive: true, keyboard: false,
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
      const confirmed = v.usvConfidence === "name_match";
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
  // drawUsv/drawSub/drawHeat are plain functions rebuilt each render, so the linter wants them
  // listed. Adding them would recreate `draw` on every render — which is harmless (it is
  // immediately stored in drawRef and only ever invoked through that ref) but also pointless,
  // and it obscures that this callback exists to capture the CURRENT selection and handlers.
  // The rule is right in general; here the ref indirection is the deliberate design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Only treat it as a starting centre if it actually has coordinates. The ISS is a
      // positionless feed (its dot moves live), so selecting it must NOT drive the initial
      // centre — otherwise the map mounts at [null,null] and lands somewhere meaningless.
      const startFix = start && Number.isFinite(start.lat) && Number.isFinite(start.lng) ? start : null;
      if (startFix) centred.current = startFix.id;
      const iv = initialViewRef.current;
      const map = Leaflet.map(elRef.current, {
        center: startFix ? [startFix.lat, startFix.lng] : (iv ? iv.center : [20, 0]),
        zoom: startFix ? 7 : (iv ? iv.zoom : 2),
        worldCopyJump: true, preferCanvas: true,
        zoomControl: false, minZoom: 1,
        ...(maxZoomRef.current ? { maxZoom: maxZoomRef.current } : {}),
        scrollWheelZoom: scrollWheelRef.current,
      });
      Leaflet.control.zoom({ position: "topright" }).addTo(map);
      addBaseTiles(Leaflet, map);
      layerRef.current = Leaflet.layerGroup().addTo(map);
      advLayerRef.current = Leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      guardTouchScroll(map);
      watchUserPan(map);   // so following never fights a deliberate pan
      // DO NOT redraw while a popup is open. draw() clears and rebuilds the layer group,
      // which destroys the marker the popup is bound to — the popup opened and vanished in
      // the same instant. Leaflet pans to fit a popup in view, that pan fires moveend, and
      // moveend redraws: the popup killed itself. HeatMap never hit this because it had no
      // moveend redraw at all; the bug surfaced with the Aug 1 merge onto WorldMap.
      map.on("moveend zoomend", () => { if (!map._popup) drawRef.current(); });
      map.on("popupclose", () => { if (pendingDraw.current) { pendingDraw.current = false; drawRef.current(); } });
      setTimeout(() => { try { map.invalidateSize(); draw(); } catch { /* not mounted */ } }, 200);

      // Leaflet caches the container's size. When the pane is resized — dragging the list
      // divider, rotating a phone, entering fullscreen — it keeps using the OLD dimensions, so
      // its SVG overlay pane stays clipped to the old viewport and any vector drawn beyond it
      // (advisory rectangles, heat circles, trails) simply vanishes. Nothing errors; the shapes
      // are just outside a stale clip rect. invalidateSize() on every resize is the fix.
      // Throttled to one call per frame so dragging the divider stays smooth.
      if (typeof ResizeObserver !== "undefined") {
        let queued = false;
        const ro = new ResizeObserver(() => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            try { map.invalidateSize(); drawRef.current(); } catch { /* unmounted */ }
          });
        });
        ro.observe(elRef.current);
        roRef.current = ro;
      }
    } catch { /* leaflet unavailable */ }
    return () => {
      try {
        if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
        if (mapRef.current) { mapRef.current.off("moveend zoomend"); mapRef.current.remove(); mapRef.current = null; }
      } catch { /* already gone */ }
    };
  }, []);

  // redraw when the DATA changes — not when a parent re-render hands us new function
  // identities, which would clear and rebuild every marker for no reason
  // Every input draw() reads must appear here, or toggling that layer changes nothing until some
  // OTHER dependency happens to fire. usvContacts and subContacts were missing: switching SEA
  // DRONES or SUB SUPPORT on fetched the data and passed it down, but no redraw was scheduled, so
  // the contacts only appeared on the next zoom/pan (which redraws via the moveend handler).
  // AND DO NOT REDRAW WHILE A POPUP IS OPEN — same reason as the moveend handler above. draw()
  // clears the layer group, so the marker holding the popup is destroyed and the popup closes in
  // the instant it opened. This path is the one HeatMap hits: it REFETCHES on a timer, so
  // data.sites arrives as a new array identity every cycle, this effect re-runs, and the popup
  // dies — which is why the composite MAP view was fine (it does not refetch heat on a timer) and
  // the Drones ACTIVITY view was not.
  // The deferred redraw is not skipped: closing the popup fires popupclose, which runs it.
  useEffect(() => {
    const map = mapRef.current;
    if (map && map._popup) { pendingDraw.current = true; return; }
    drawRef.current();
  },
    [feeds, selectedId, liveContacts, heatSites, heatRadius, heatMeta, usvContacts, subContacts, showFeeds]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !selectedId) return;
    if (centred.current === selectedId) return;      // already looking at it
    centred.current = selectedId;
    const f = feedsRef.current.find((x) => x.id === selectedId);
    // same reason as the cluster handler: flyTo arcs outward first, which looks like the map
    // is throwing you away before it brings you back. Also: never zoom OUT on selection —
    // if the user has already zoomed in past 5, respect where they are.
    // The ISS (and any positionless feed) has no fixed point to fly to — its live marker moves
    // on its own. Guard against centring on null, which threw inside Leaflet's projection.
    if (f && Number.isFinite(f.lat) && Number.isFinite(f.lng))
      map.setView([f.lat, f.lng], Math.max(map.getZoom(), 5), { animate: true, duration: 0.6 });
  }, [selectedId]);

  return <div ref={elRef} style={{ width: "100%", height: "100%", background: "#0B0E13" }} />;
}

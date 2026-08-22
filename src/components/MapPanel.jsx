import { useEffect, useState, useRef } from "react";
import { Layers } from "lucide-react";
import WorldMap from "./WorldMap.jsx";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";
import { airlineFromCallsign, emergencyFromSquawk } from "../airlines.js";

// One map, three switchable layers. Previously these lived on separate maps with separate
// controls — feeds here, live sweep contacts there, activity heat somewhere else — which
// made them feel like unrelated features rather than views of the same planet.
// Below this zoom the visible area is most of a hemisphere: the query would be meaningless, the
// payload large, and the dots a solid smear. Roughly country-to-continent scale and closer.
// Zoom 6, not 4. The upstream feed caps a query at 250nm regardless of what is asked for, so at
// wider views traffic appeared as a disc in the middle of an empty screen. At zoom 6 the visible
// area is roughly what 250nm covers, so the layer describes the whole map rather than part of it.
// Zoom 5. Six was too strict: over sparsely covered regions the layer showed nothing at all and
// read as broken. The 250nm cap means a wider view is only partly covered, which the footnote
// states — partial coverage that says so beats an empty map that does not.
const AIR_MIN_ZOOM = 5;
// Matches the upstream cap. Asking for more returns the same data and a `clamped` flag.
const AIR_MAX_RADIUS_NM = 250;

export default function MapPanel({ feeds, selectedId, onSelect, onOpenSighting, onOpenVessel, userLoc = null, tab = "world",
  // Phones get a shorter map: at 60vh a map plus its chips filled the viewport edge to edge,
  // leaving nowhere obvious to scroll from. 44vh keeps surrounding context visible so the
  // page still reads as a page.
  height = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches
    ? "min(44vh, 420px)" : "min(60vh, 560px)" }) {
  const isDrones = tab === "drones";
  const [whyLive, setWhyLive] = useState(false);
  const [showFeeds, setShowFeeds] = useState(!isDrones);   // world leads with feeds; drones does not
  const [showLive, setShowLive] = useState(isDrones);      // drones leads with live contacts
  const [showHeat, setShowHeat] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [adv, setAdv] = useState(null);
  // Live aircraft on the WORLD map. A tester on Android reported that no traffic appeared anywhere
  // unless a site was selected, and that zooming elsewhere showed nothing while a competitor's map
  // had data everywhere. They were right: /api/aircraft was only ever called by AviationRadar,
  // using the SELECTED SITE's coordinates. The world map never asked for aircraft at all.
  //
  // On by default (world tab only), because "traffic just appears" was the expectation, and gated
  // on zoom below so a whole-planet view does not fire a meaningless 10,000nm query every pan.
  // What the map is currently looking at, reported upward by WorldMap. Drives the aircraft query.
  const [view, setView] = useState(null);
  const [showAir, setShowAir] = useState(!isDrones);
  const [air, setAir] = useState(null);
  const [airAge, setAirAge] = useState(null);
  // The locked aircraft's record. A Leaflet tooltip is hover-only, so on a phone a tap locked the
  // target and showed nothing at all — the reticle was the only feedback a tester got.
  const [airSel, setAirSel] = useState(null);
  const [showUsv, setShowUsv] = useState(isDrones);
  const [showSub, setShowSub] = useState(isDrones);
  // If the tab changes while the map stays mounted, re-apply the per-tab defaults so the map
  // always leads with the right dataset (drones-> live contacts, world-> catalogue feeds).
  // Advisories change on the order of days; fetch once when the layer is first switched on.
  useEffect(() => {
    if (!showAdv || adv) return;
    let alive = true;
    fetch(`${BACKEND_URL}/api/airspace/advisories`)
      .then((r) => r.json())
      .then((j) => { if (alive) setAdv(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, [showAdv, adv]);

  const lastTab = useRef(tab);
  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    setShowFeeds(!isDrones); setShowLive(isDrones); setShowUsv(isDrones); setShowSub(isDrones);
    setShowAir(!isDrones);   // world leads with live traffic; drones does not
    // showHeat was the ONE layer this line did not set, so switching to the drones tab turned on
    // live contacts, sea drones and sub support — but left the activity layer off, which is the
    // most drone-specific layer of the four. The map looked empty and there was nothing to say
    // a layer was available. Note the heat fetch only runs when showHeat is true, so this does
    // add one archive query per visit to the drones tab in map mode.
    setShowHeat(isDrones);
    // showHeat was the ONE layer this line did not set, so switching to the drones tab turned on
    // live contacts, sea drones and sub support — but left the activity layer off, which is the
    // most drone-specific layer of the four. The map looked empty and there was nothing to say
    // a layer was available. Note the heat fetch only runs when showHeat is true, so this does
    // add one archive query per visit to the drones tab in map mode.
    setShowHeat(isDrones);
  }, [tab, isDrones]);
  const [mins, setMins] = useState(60);      // live window
  const [days, setDays] = useState(7);
  // Same radius control the standalone Activity map has. Without it the two surfaces showed
  // the same dataset with different capabilities — and the map view silently stayed at 250nm,
  // the one radius that makes a dormant base look busy.
  const [heatRadius, setHeatRadius] = useState(250);       // activity window
  const [live, setLive] = useState(null);
  const [heat, setHeat] = useState(null);
  const [heatMeta, setHeatMeta] = useState(null);   // maxByRadius, radii — needed to scale colour
  const [usv, setUsv] = useState(null);
  const [sub, setSub] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!showLive) { setLive(null); return; }
    let alive = true;
    const load = () => fetch(`${BACKEND_URL}/api/drones?mins=${mins}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setLive(j.drones || []); })
      .catch(() => { if (alive) setNote("live sweep unavailable"); });
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [showLive, mins]);

  useEffect(() => {
    if (!showHeat) { setHeat(null); setHeatMeta(null); return; }
    let alive = true;
    fetch(`${BACKEND_URL}/api/drones/heat?days=${days}`)
      .then((r) => r.json())
      .then((j) => { if (alive) { setHeat(j.sites || []); setHeatMeta(j); } })
      .catch(() => { if (alive) setNote("activity data unavailable"); });
    return () => { alive = false; };
  }, [showHeat, days]);

  // Follows the MAP, not the selected site. Debounced, because a pan fires many moveend events and
  // the proxy allows 120 requests a minute across all clients.
  useEffect(() => {
    if (!showAir || !view) { setAir(null); return; }
    if (view.zoom < AIR_MIN_ZOOM) { setAir(null); return; }
    let alive = true;
    // Radius from the viewport's diagonal, so the circular query covers the rectangle on screen.
    const r = Math.min(AIR_MAX_RADIUS_NM, Math.max(50, Math.round(view.radiusNm)));
    const load = () =>
      fetch(`${BACKEND_URL}/api/aircraft?lat=${view.lat.toFixed(3)}&lon=${view.lon.toFixed(3)}&radius=${r}`)
        .then((res) => res.json())
        .then((j) => {
          if (!alive) return;
          // Stamped on arrival. The map interpolates forward from this instant using each
          // aircraft's own heading and ground speed, so the dots move continuously between polls
          // instead of teleporting every fifteen seconds.
          setAir({ at: Date.now(), items: j.aircraft || [] });
          setAirAge(Number.isFinite(j.ageSec) ? j.ageSec : null);
        })
        .catch(() => { if (alive) setNote("live aircraft unavailable"); });
    // Debounced on the first call so a pan fires one request rather than thirty; thereafter every
    // 15s. Four requests a minute per viewer, against a proxy limit of 120.
    const t = setTimeout(load, 600);
    const id = setInterval(load, 15000);
    return () => { alive = false; clearTimeout(t); clearInterval(id); };
  }, [showAir, view]);

  useEffect(() => {
    if (!showUsv) { setUsv(null); return; }
    let alive = true;
    const load = () => fetch(`${BACKEND_URL}/api/usv`)
      .then((r) => r.json())
      .then((j) => { if (alive) { setUsv(j.vessels || []); if (j.upstream === "down") setNote("AIS provider offline — sea drones unavailable"); } })
      .catch(() => { if (alive) setNote("sea drone data unavailable"); });
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [showUsv]);

  useEffect(() => {
    if (!showSub) { setSub(null); return; }
    let alive = true;
    const load = () => fetch(`${BACKEND_URL}/api/subsupport`)
      .then((r) => r.json())
      .then((j) => { if (alive) setSub(j.vessels || []); })
      .catch(() => { if (alive) setNote("support vessel data unavailable"); });
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [showSub]);

  const chip = (on, label, toggle, col) => (
    <button key={label} onClick={toggle} className="px-2 py-1 rounded font-mono flex-shrink-0"
      style={{ fontSize: 10, letterSpacing: 0.3, whiteSpace: "nowrap",
        color: on ? C.ink : C.dim, background: on ? col : C.panel2,
        border: `1px solid ${on ? col : C.line}` }}>
      {label}
    </button>
  );

  const windowChips = (opts, val, set) => (
    <div className="flex items-center gap-1">
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => set(v)} className="px-1.5 py-0.5 rounded font-mono"
          style={{ fontSize: 9, color: val === v ? C.text : C.faint,
            background: val === v ? C.panel2 : "transparent",
            border: `1px solid ${val === v ? C.line : "transparent"}` }}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {/* THE NAME. This is now the only map in the app — the bare WorldMap in the viewer was the
          same component without any of these controls, and one column made the duplication
          obvious. It had a WORLD MAP header; that comes across with it. */}
      {/* A TITLE THAT LOOKS LIKE ONE. Everything in this panel was 9-10px monospace in C.faint —
          the heading, the layer label, the chips and a sixty-word paragraph all at the same weight,
          so nothing read as a heading and nothing read as prose. */}
      {/* NO FEED COUNT HERE. The filter bar already states it, and the map is showing exactly
          those feeds — saying 308 twice on one screen invites a reader to wonder whether the two
          numbers mean different things. */}
      {/* A RULE AND A MARKER, not just a larger font. Bold text one size up from its neighbours
          still reads as text — a heading needs something that is not a word. The cyan bar is the
          same accent the active layer chips use, so it belongs to this panel rather than looking
          imported. */}
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <span style={{ width: 3, height: 14, background: C.cyan, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>World map</span>
        <span style={{ flex: 1, height: 1, background: C.line }} />
      </div>
      <div className="font-mono" style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginBottom: 3 }}>
        LAYERS — stack any combination
      </div>
      <div className="flex items-center justify-center gap-1.5 flex-wrap" style={{ marginBottom: 5 }}>
        <Layers size={11} color={C.faint} />
        {chip(showFeeds, "FEEDS", () => setShowFeeds(!showFeeds), C.cyan)}
        {chip(showLive, "LIVE", () => setShowLive(!showLive), "#C084FC")}
        {chip(showAdv, "ADVISORIES", () => setShowAdv(!showAdv), "#F0553B")}
        {chip(showHeat, "ACTIVITY", () => setShowHeat(!showHeat), "#F6A821")}
        {chip(showAir, "AIR", () => setShowAir(!showAir), "#F6A821")}
        {chip(showUsv, "SEA", () => setShowUsv(!showUsv), "#2DD4BF")}
        {chip(showSub, "SUB", () => setShowSub(!showSub), "#F0553B")}
      </div>

      {/* SIXTY WORDS, PERMANENTLY ON SCREEN, in the same styling as the controls above it. The
          distinction it draws is real and worth stating — a contact here may not be on the radar
          below — but most readers never wonder, and prose in a control panel reads as noise. One
          line in front, the rest one tap away. */}
      {showLive && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginBottom: 5, lineHeight: 1.5 }}>
          LIVE shows the whole sweep — a radar below shows one site, right now.{" "}
          <button onClick={() => setWhyLive((v) => !v)}
            style={{ color: C.dim, background: "none", border: "none", padding: 0,
              textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
            {whyLive ? "less" : "why?"}
          </button>
          {whyLive && (
            <span style={{ display: "block", marginTop: 3 }}>
              LIVE plots the <b>worldwide</b> sweep — every watched airspace, anything seen in the
              selected window. A radar below plots only what is broadcasting <b>near that one site,
              right now</b>. So contacts can appear here and not there: they are elsewhere on the
              planet, or were seen earlier in the window.
            </span>
          )}
        </div>
      )}

      {(showLive || showHeat) && (
        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 5 }}>
          {showLive && (
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 9, color: "#C084FC" }}>SEEN IN</span>
              {windowChips([[60, "1h"], [360, "6h"], [1440, "24h"]], mins, setMins)}
              <span style={{ fontSize: 9, color: C.faint }}>{live ? `${live.length} contacts` : "…"}</span>
            </div>
          )}
          {showHeat && (
            <div className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, color: "#F6A821" }}>ACTIVITY OVER</span>
              {windowChips([[1, "1d"], [7, "7d"], [30, "30d"], [90, "90d"]], days, setDays)}
              <span style={{ fontSize: 9, color: "#F6A821", marginLeft: 4 }}>WITHIN</span>
              {windowChips([["field", "at field"], [25, "25nm"], [100, "100nm"], [250, "250nm"]], heatRadius, setHeatRadius)}
              <span style={{ fontSize: 9, color: C.faint }}>{heat ? `${heat.length} airspaces` : "…"}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ height }} className="rounded overflow-hidden">
        <WorldMap
          // WHEEL-ZOOM OFF. WorldMap defaults it ON, and its own comment says why that is wrong
          // in a scrolling panel: the wheel hijacks the page. HeatMap passes false; this did not,
          // and after the layout change this is the largest thing on the page — so scrolling down
          // stopped dead the moment the cursor crossed the map. Two-finger pan still works, and
          // the zoom control is there for zooming.
          scrollWheelZoom={false}
          feeds={feeds}
          showFeeds={showFeeds}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenSighting={onOpenSighting}
          onOpenVessel={onOpenVessel}
          liveContacts={showLive ? live : null}
          aircraft={showAir ? air : null}
          onView={setView}
          onAirSelect={setAirSel}
          usvContacts={showUsv ? usv : null}
          subContacts={showSub ? sub : null}
          userLoc={userLoc}
          heatSites={showHeat ? heat : null}
          heatRadius={heatRadius}
          heatMeta={heatMeta}
          showIss={!isDrones}
          advisories={showAdv && adv ? adv.advisories : null}
        />
      </div>

      {/* DOCKED below the map, not floating beside the aircraft. A floating card needs
          map-container pixels and a positioned ancestor; this panel has neither to get wrong, and
          works identically on a phone. The map already keeps the locked aircraft centred, so the
          target and its details are both in view without either chasing the other.

          NO DEPARTURE OR ARRIVAL. ADS-B does not carry them — aircraft broadcast where they ARE,
          not where they are going, and `operator` is null on every one. Trackers showing routes
          license schedule data. The airline below is decoded from the callsign prefix, which is
          real; a route would be invented. */}
      {airSel && (
        <div className="font-mono" style={{ marginTop: 6, padding: "8px 10px", borderRadius: 7,
          background: "rgba(4,18,31,0.95)", border: "1px solid rgba(0,255,127,0.6)",
          boxShadow: "0 0 12px rgba(0,255,127,0.2)" }}>
          <div className="flex items-start justify-between gap-2">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: airSel.lost ? C.dim : "#00FF7F" }}>
                {airlineFromCallsign(airSel.callsign) || airSel.callsign || airSel.id || "unknown"}
                {airSel.military ? " \u00b7 MIL" : ""}{airSel.isDrone ? " \u00b7 UAV" : ""}
              </div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
                {airlineFromCallsign(airSel.callsign) && airSel.callsign ? airSel.callsign + " \u00b7 " : ""}
                {airSel.desc || airSel.typeCode || "type unknown"}
                {airSel.registration ? " \u00b7 " + airSel.registration : ""}
              </div>
            </div>
            <button onClick={() => setAirSel(null)} aria-label="Close"
              style={{ color: C.dim, fontSize: 14, lineHeight: 1 }}>&times;</button>
          </div>
          {airSel.lost && (
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 5 }}>
              Contact lost — it landed, stopped transmitting, or moved beyond the 250nm the feed covers.
            </div>
          )}
          {!airSel.lost && <div style={{ fontSize: 11.5, color: "#F6A821", marginTop: 5 }}>
            {Number.isFinite(airSel.altFt) ? Math.round(airSel.altFt).toLocaleString() + "ft" : "\u2014"}
            {Number.isFinite(airSel.groundSpeedKt) ? " \u00b7 " + Math.round(airSel.groundSpeedKt) + "kt" : ""}
            {Number.isFinite(airSel.verticalRateFpm) && Math.abs(airSel.verticalRateFpm) > 200
              ? (airSel.verticalRateFpm > 0 ? " \u00b7 climbing" : " \u00b7 descending") : ""}
            {airSel.onGround ? " \u00b7 on the ground" : ""}
          </div>}
          {emergencyFromSquawk(airSel.squawk) && (
            <div style={{ fontSize: 10.5, color: "#F0553B", marginTop: 3 }}>
              {emergencyFromSquawk(airSel.squawk)} \u00b7 squawk {airSel.squawk}
            </div>
          )}
        </div>
      )}

      <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        {showLive && "violet = UAV · amber = military · hollow = disputed · tap a contact to open its airspace. "}
        {showHeat && "Activity is measured from ADS-B broadcasters only; aircraft with transponders off are not counted. "}
        {showAir && (view && view.zoom < AIR_MIN_ZOOM
          ? "Zoom in to see live aircraft — the feed covers 250nm at a time. "
          : air && air.items && air.items.length === 0
          ? "No aircraft reported here right now. ADS-B coverage comes from volunteer receivers, " +
            "which are dense over North America and western Europe and sparse elsewhere — an empty " +
            "map here means no receiver heard anything, not that nothing is flying. "
          : `${air && air.items ? air.items.length : 0} aircraft in view, broadcast by the aircraft themselves via ADS-B` +
            `${Number.isFinite(airAge) ? `, ${airAge < 60 ? "seconds" : Math.round(airAge / 60) + " minutes"} old` : ""}. ` +
            ` within 250nm of the map centre — the upstream feed's limit, so aircraft beyond that ` +
            "are not missing, just not requested. Positions refresh every 15s; movement between " +
            "refreshes is estimated from heading and speed. ")}
        {showSub && `${sub ? sub.length : 0} submarine SUPPORT vessels — surface tenders, rescue ships and submersible motherships. Submarines themselves cannot be tracked: AIS is VHF radio and does not travel through seawater. `}
        {showUsv && `${usv ? usv.length : 0} sea drones — filled = identified fleet (Saildrone, DriX and similar), hollow = small unidentified hull. Most military USVs broadcast no AIS at all. `}
        {!showLive && !showHeat && "Tap a cluster to zoom in · rings are ports, dots are airports."}
        {note && ` · ${note}`}
      </div>
    </div>
  );
}

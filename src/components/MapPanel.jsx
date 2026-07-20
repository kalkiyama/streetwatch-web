import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import WorldMap from "./WorldMap.jsx";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// One map, three switchable layers. Previously these lived on separate maps with separate
// controls — feeds here, live sweep contacts there, activity heat somewhere else — which
// made them feel like unrelated features rather than views of the same planet.
export default function MapPanel({ feeds, selectedId, onSelect, onOpenSighting, onOpenVessel,
  // Phones get a shorter map: at 60vh a map plus its chips filled the viewport edge to edge,
  // leaving nowhere obvious to scroll from. 44vh keeps surrounding context visible so the
  // page still reads as a page.
  height = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches
    ? "min(44vh, 420px)" : "min(60vh, 560px)" }) {
  const [showFeeds, setShowFeeds] = useState(true);
  const [showLive, setShowLive] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [showUsv, setShowUsv] = useState(false);
  const [showSub, setShowSub] = useState(false);
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
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 5 }}>
        <Layers size={11} color={C.faint} />
        {chip(showFeeds, "FEEDS", () => setShowFeeds(!showFeeds), C.cyan)}
        {chip(showLive, "LIVE DRONES", () => setShowLive(!showLive), "#C084FC")}
        {chip(showHeat, "ACTIVITY", () => setShowHeat(!showHeat), "#F6A821")}
        {chip(showUsv, "SEA DRONES", () => setShowUsv(!showUsv), "#2DD4BF")}
        {chip(showSub, "SUB SUPPORT", () => setShowSub(!showSub), "#F0553B")}
      </div>

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
              {windowChips([[25, "25nm"], [100, "100nm"], [250, "250nm"]], heatRadius, setHeatRadius)}
              <span style={{ fontSize: 9, color: C.faint }}>{heat ? `${heat.length} airspaces` : "…"}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ height }} className="rounded overflow-hidden">
        <WorldMap
          feeds={feeds}
          showFeeds={showFeeds}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenSighting={onOpenSighting}
          onOpenVessel={onOpenVessel}
          liveContacts={showLive ? live : null}
          usvContacts={showUsv ? usv : null}
          subContacts={showSub ? sub : null}
          heatSites={showHeat ? heat : null}
          heatRadius={heatRadius}
          heatMeta={heatMeta}
        />
      </div>

      <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        {showLive && "violet = UAV · amber = military · hollow = disputed · tap a contact to open its airspace. "}
        {showHeat && "Activity is measured from ADS-B broadcasters only; aircraft with transponders off are not counted. "}
        {showSub && `${sub ? sub.length : 0} submarine SUPPORT vessels — surface tenders, rescue ships and submersible motherships. Submarines themselves cannot be tracked: AIS is VHF radio and does not travel through seawater. `}
        {showUsv && `${usv ? usv.length : 0} sea drones — filled = identified fleet (Saildrone, DriX and similar), hollow = small unidentified hull. Most military USVs broadcast no AIS at all. `}
        {!showLive && !showHeat && "Tap a cluster to zoom in · rings are ports, dots are airports."}
        {note && ` · ${note}`}
      </div>
    </div>
  );
}

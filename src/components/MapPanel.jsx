import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import WorldMap from "./WorldMap.jsx";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// One map, three switchable layers. Previously these lived on separate maps with separate
// controls — feeds here, live sweep contacts there, activity heat somewhere else — which
// made them feel like unrelated features rather than views of the same planet.
export default function MapPanel({ feeds, selectedId, onSelect, onOpenSighting, height = "min(60vh, 560px)" }) {
  const [showFeeds, setShowFeeds] = useState(true);
  const [showLive, setShowLive] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [mins, setMins] = useState(60);      // live window
  const [days, setDays] = useState(7);       // activity window
  const [live, setLive] = useState(null);
  const [heat, setHeat] = useState(null);
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
    if (!showHeat) { setHeat(null); return; }
    let alive = true;
    fetch(`${BACKEND_URL}/api/drones/heat?days=${days}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setHeat(j.sites || []); })
      .catch(() => { if (alive) setNote("activity data unavailable"); });
    return () => { alive = false; };
  }, [showHeat, days]);

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
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 9, color: "#F6A821" }}>ACTIVITY OVER</span>
              {windowChips([[1, "1d"], [7, "7d"], [30, "30d"], [90, "90d"]], days, setDays)}
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
          liveContacts={showLive ? live : null}
          heatSites={showHeat ? heat : null}
        />
      </div>

      <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        {showLive && "violet = UAV · amber = military · hollow = disputed · tap a contact to open its airspace. "}
        {showHeat && "Activity is measured from ADS-B broadcasters only; aircraft with transponders off are not counted. "}
        {!showLive && !showHeat && "Tap a cluster to zoom in · rings are ports, dots are airports."}
        {note && ` · ${note}`}
      </div>
    </div>
  );
}

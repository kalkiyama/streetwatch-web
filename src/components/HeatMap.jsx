import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { C, HEAT_RAMP } from "../theme.js";
import WorldMap from "./WorldMap.jsx";
import { BACKEND_URL } from "../config.js";

// Where military / UAV activity actually concentrates, measured from this sweep's own
// archive. Colour and size come from observed contact counts — not from any outside
// claim about where a conflict is.

export default function HeatMap({ days: initialDays = 7 }) {
  // The look-back selector must live INSIDE this component: in fullscreen the HeatMap div is
  // the only thing above the overlay, so any controls rendered by the parent are buried.
  const [days, setDays] = useState(initialDays);
  useEffect(() => { setDays(initialDays); }, [initialDays]);   // external selector (when visible) still wins
  const [data, setData] = useState(null);
  const [ageH, setAgeH] = useState(null);
  const [scaleMax, setScaleMax] = useState(null);
  const scaleMaxRef = useRef(null);
  // Which radius the circles represent. 25nm ≈ the airfield and its immediate approaches;
  // 100nm ≈ its working airspace; 250nm ≈ the whole region the sweep polls.
  const [radius, setRadius] = useState(250);
  const [state, setState] = useState("loading");
  const [full, setFull] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`${BACKEND_URL}/api/drones/heat?days=${days}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { if (alive) { setData(j);
        setAgeH(j.archiveAgeHours != null ? j.archiveAgeHours : null); setState("ok"); } })
      .catch((e) => { if (alive) setState(String(e.message) === "503" ? "off" : "error"); });
    return () => { alive = false; };
  }, [days]);

  // The Leaflet instance, the fullscreen invalidateSize timers and the draw effect that used
  // to live here are GONE — WorldMap owns the map now (Aug 1). The two setTimeout re-measures
  // (90ms and 150ms after a fullscreen toggle) are deliberately NOT ported: WorldMap has a
  // ResizeObserver, which responds to the actual resize instead of guessing a duration.


  // Esc exits fullscreen, and the page behind shouldn't scroll while it's open
  useEffect(() => {
    if (!full) return;
    const esc = (e) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [full]);


  // Fullscreen must sit ABOVE everything else the app renders. The page behind contains other
  // Leaflet maps whose panes and controls run z 400-1000, and our own radar overlay bars sit at
  // 1200 — so a fullscreen shell at 1000 let the radar map beneath punch through as a floating
  // rectangle in the middle of the activity view. 5000 clears every layer the app uses.
  const shell = full
    ? { position: "fixed", inset: 0, zIndex: 5000, background: "#0A0D12", padding: 10,
        display: "flex", flexDirection: "column", gap: 6 }
    : {};

  return (
    <div className="px-3 pb-2" style={shell}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span className="font-mono" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1 }}>
          ACTIVITY MAP
        </span>
        <div className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
          {/* In normal view the archive tab's own selector drives `days` (shown twice was
              noise); in fullscreen that selector is buried, so the chips appear here instead. */}
          {full && [1, 7, 30, 90].map((d) => {
            // A window longer than the archive cannot return more than the archive holds. Rather
            // than let "90d" imply three months over a three-day-old archive, dim it and say what
            // it will actually return.
            const beyond = ageH != null && d * 24 > ageH;
            return (
              <button key={d} onClick={() => setDays(d)} className="rounded font-mono"
                title={beyond ? `Archive holds ${ageH}h so far — this window returns everything recorded` : `Last ${d} days`}
                style={{ fontSize: 8.5, padding: "3px 5px", color: days === d ? "#0A0D12" : C.amber,
                  background: days === d ? C.amber : "transparent",
                  border: `1px solid ${C.amber}66`, opacity: beyond && days !== d ? 0.45 : 1 }}>
                {d}d
              </button>
            );
          })}
          {full && <span style={{ width: 4 }} />}
          <button onClick={() => setRadius("field")} className="rounded font-mono"
            title="Rank by aircraft observed within 10nm and below 4,000ft of this watched site. Other airfields may lie inside that radius, so this measures proximity to the site rather than use of this particular base."
            style={{ fontSize: 8.5, padding: "3px 5px", color: radius === "field" ? "#0A0D12" : "#37C46A",
              background: radius === "field" ? "#37C46A" : "transparent",
              border: "1px solid rgba(55,196,106,0.5)" }}>
            AT FIELD
          </button>
          {[25, 100, 250].map((r) => (
            <button key={r} onClick={() => setRadius(r)} className="rounded font-mono"
              title={r === 25 ? "The airfield and its immediate approaches"
                : r === 100 ? "Its working airspace"
                : "The full region the sweep polls"}
              style={{ fontSize: 8.5, padding: "3px 5px", color: radius === r ? "#0A0D12" : "#C084FC",
                background: radius === r ? "#C084FC" : "transparent",
                border: "1px solid rgba(192,132,252,0.4)" }}>
              {r}nm
            </button>
          ))}
          <button onClick={() => setFull(!full)} className="flex items-center gap-1 rounded font-mono"
            style={{ fontSize: 8.5, padding: "3px 6px", color: "#C084FC", border: "1px solid rgba(192,132,252,0.4)", background: "transparent" }}>
            {full ? <><X size={10} /> CLOSE</> : <><Maximize2 size={10} /> FULL</>}
          </button>
        </div>
      </div>
      {ageH != null && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginBottom: 4, lineHeight: 1.5 }}>
          Archive holds {ageH}h of recorded activity so far ({(ageH / 24).toFixed(1)} days).
          {ageH < days * 24 ? ` The ${days}-day window therefore shows everything recorded, not ${days} full days.` : ""}
        </div>
      )}
      {state === "loading" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>measuring activity…</div>}
      {state === "off" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>No archive configured on this instance.</div>}
      {state === "error" && <div style={{ fontSize: 11, color: C.dim, paddingBottom: 6 }}>Activity map unavailable right now.</div>}
      <div style={{ height: full ? "auto" : 380, flex: full ? 1 : undefined,
        borderRadius: 4, overflow: "hidden", background: "#0A0D12" }}>
        {/* WorldMap fills its parent (height:100%), so the height MUST live on this wrapper —
            without it the map collapses to zero and renders nothing, which looks like a broken
            merge rather than a missing style. scrollWheelZoom is off because this sits inside a
            scrolling panel and wheel-zoom would hijack the page scroll. */}
        <WorldMap
          feeds={[]} showFeeds={false} showIss={false}
          selectedId={null} onSelect={() => {}}
          heatSites={data && data.sites ? data.sites : null}
          heatRadius={radius}
          heatMeta={data}
          scrollWheelZoom={false}
          maxZoom={10}
          initialView={{ center: [25, 10], zoom: 2 }}
        />
      </div>
      <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
        {radius === "field"
          ? "Colour ranks sites by aircraft seen within 10nm below 4,000ft of the watched site. Other airfields can lie inside that radius, so this is proximity to the site, not confirmed use of this base."
          : `Colour ranks sites by contacts within ${radius}nm — that is the airspace, not the field. Use AT FIELD to rank by aircraft that actually came low and close.`}
      </div>
      {scaleMax != null && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>
          Colour is RELATIVE to the busiest site in this view ({scaleMax}), on a log scale — so a
          site can read red without being busy in absolute terms. Bands here:{" "}
          {HEAT_RAMP.map((stop, i) => {
            const from = Math.max(1, Math.round(Math.exp(stop.at * Math.log(Math.max(2, scaleMax)))));
            return (
              <span key={stop.at}>
                <span style={{ color: stop.c }}>■</span> {from}+{i < HEAT_RAMP.length - 1 ? " · " : ""}
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1.5 font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 4, flexWrap: "wrap" }}>
        <span>quiet</span>
        {HEAT_RAMP.map((r) => <span key={r.at} style={{ width: 14, height: 8, background: r.c, borderRadius: 2, display: "inline-block" }} />)}
        <span>busiest</span>
        {data && <span style={{ marginLeft: 6 }}>· {data.count} airspaces with activity in {data.windowDays}d</span>}
      </div>
      <div style={{ fontSize: 9, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>
        {radius === 250
          ? "Circles show aircraft within 250nm — the full region the sweep polls, not the airfield. Neighbouring circles overlap; each aircraft is counted at the site it came closest to."
          : radius === 100
            ? "Circles show aircraft within 100nm — roughly a site's working airspace."
            : "Circles show aircraft within 25nm — the airfield and its immediate approaches. This is the closest thing to activity at the base itself."} 
        Measured from aircraft that broadcast ADS-B. Aircraft flying with transponders off — which
        includes most combat activity — are not counted, so this shows the visible traffic around a
        region, not the fighting itself.
      </div>
    </div>
  );
}

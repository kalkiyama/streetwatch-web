import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { guardTouchScroll } from "./mapTouch.js";
import { C, heatColor, heatIntensity, HEAT_RAMP, addBaseTiles } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// Where military / UAV activity actually concentrates, measured from this sweep's own
// archive. Colour and size come from observed contact counts — not from any outside
// claim about where a conflict is.

export default function HeatMap({ days: initialDays = 7 }) {
  // The look-back selector must live INSIDE this component: in fullscreen the HeatMap div is
  // the only thing above the overlay, so any controls rendered by the parent are buried.
  const [days, setDays] = useState(initialDays);
  useEffect(() => { setDays(initialDays); }, [initialDays]);   // external selector (when visible) still wins
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
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

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      zoomControl: false, attributionControl: true, scrollWheelZoom: false,
      minZoom: 1, maxZoom: 10, worldCopyJump: true,
    }).setView([25, 10], 2);
    Leaflet.control.zoom({ position: "topright" }).addTo(map.current);
    addBaseTiles(Leaflet, map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, []);

  useEffect(() => {
    if (map.current) setTimeout(() => map.current && map.current.invalidateSize(), 150);
  }, [full]);

  // re-measure whenever the frame size changes (entering AND leaving fullscreen)
  useEffect(() => { const t = setTimeout(() => map.current && map.current.invalidateSize(), 90); return () => clearTimeout(t); }, [full]);


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

  useEffect(() => {
    if (!map.current || !data || !data.sites) return;
    if (layer.current) layer.current.remove();
    layer.current = Leaflet.layerGroup().addTo(map.current);
    guardTouchScroll(map.current);
    data.sites.forEach((s) => {
      const pick = radius === "field" ? { c: s.terminal_contacts, u: null, m: null, p: s.terminal_points }
                 : radius === 25 ? { c: s.c25, u: s.uav25, m: s.mil25, p: s.p25 }
                 : radius === 100 ? { c: s.c100, u: s.uav100, m: s.mil100, p: s.p100 }
                 : { c: s.contacts, u: s.uav, m: s.military, p: s.points };
      const shown = pick.c == null ? s.contacts : pick.c;
      const maxAt = (data.maxByRadius && data.maxByRadius[radius]) || data.maxContacts || 2;
      if (scaleMaxRef.current !== maxAt) { scaleMaxRef.current = maxAt; setScaleMax(maxAt); }
      const t = heatIntensity(shown, maxAt);
      const col = heatColor(t);
      Leaflet.circleMarker([s.lat, s.lon], {
        radius: 5 + t * 16,
        color: col, weight: 1.5, fillColor: col, fillOpacity: 0.35,
      })
        .bindPopup(
          // Structured, not prose: one row per fact, each stated ONCE, widest area to tightest.
          // The old version repeated the terminal figure in AT FIELD mode and read as a paragraph,
          // which buried the very distinction the rows exist to make.
          (() => {
            // The row you selected leads. A table where the chosen figure sits third reads as
            // "here are some numbers"; putting it first reads as "here is the answer, and here is
            // the context that qualifies it".
            const row = (label, value, lead) =>
              `<tr><td style="padding:${lead ? 3 : 1}px 8px ${lead ? 3 : 1}px 0;opacity:${lead ? 0.95 : 0.6};white-space:nowrap;` +
              `${lead ? "color:#C084FC;" : ""}">${label}</td>` +
              `<td style="padding:${lead ? 3 : 1}px 0;font-weight:${lead ? 700 : 400};${lead ? "color:#C084FC;font-size:12px;" : ""}">${value}</td></tr>`;

            // ONE FIGURE — the one the user asked for. Everything else was noise dressed as
            // context: a user selecting "at the field" does not need the 25, 100 and 250nm counts
            // alongside it, and showing them is what forced four sentences of disclaimer
            // explaining which was which.
            const pick = {
              field: { label: "Low and close", value: s.terminal_contacts, uav: null,
                       scope: "within 10nm and below 4,000ft", points: s.terminal_points },
              25:    { label: "Within 25nm",  value: s.c25,  uav: s.uav25,  scope: "within 25nm, any altitude",  points: s.p25 },
              100:   { label: "Within 100nm", value: s.c100, uav: s.uav100, scope: "within 100nm, any altitude", points: s.p100 },
              250:   { label: "Full sweep",   value: s.contacts, uav: s.uav, scope: "within 250nm — the whole polling radius, not this airfield", points: s.points },
            }[radius] || {};

            const rows = [];
            if (pick.value != null)
              rows.push(row(pick.label, `${pick.value} military/UAV${pick.uav ? ` (${pick.uav} UAV)` : ""}`, true));

            // Sightings QUALIFIES the figure above rather than competing with it: one aircraft seen
            // on three passes is 1 there and 3 here, which reads as a contradiction unless stated.
            if (pick.points != null)
              rows.push(row("Sightings",
                `${pick.points} report${pick.points === 1 ? "" : "s"} of those ${pick.value} aircraft` +
                ` &middot; over ${s.span_hours || 0}h`, false));
            rows.push(row("Last seen", new Date(s.last_seen).toLocaleString(), false));

            return (
              `<b>${s.site}</b><br><span style="opacity:.7">${s.country || ""}</span>` +
              (s.nearestAirfield ? `<div style="margin-top:2px;font-size:10px;opacity:.6">near ${s.nearestAirfield}</div>` : "") +
              `<div style="margin-top:3px;font-size:10px;opacity:.75">Last ${days} day${days === 1 ? "" : "s"}` +
              `${ageH != null && ageH < days * 24 ? ` &middot; archive holds ${ageH}h` : ""}</div>` +
              `<table style="margin-top:6px;font-size:11px;border-collapse:collapse">${rows.join("")}</table>` +
              // A WARNING, not a caveat. It says THIS NUMBER MAY BE WRONG, which is a different
              // kind of statement from explaining what the number means. It stays at full strength.
              (s.nearbySites && s.nearbySites.length
                ? `<div style="margin-top:6px;font-size:10px;line-height:1.45;color:#F6A821">` +
                  `&#9888; ${s.nearbySites.map((x) => `${x.site} is ${x.nm}nm away`).join("; ")} &mdash; ` +
                  `a contact counted here could have been operating there.` +
                  `</div>`
                : "") +
              // ONE line, scoped to what is actually on screen. The remaining statements are true
              // and worth having, but they belong behind a toggle rather than in front of everyone
              // on every site. Four sentences nobody reads protect nobody.
              `<div style="margin-top:6px;opacity:.6;font-size:10px;line-height:1.4">` +
              `${pick.scope || ""} &middot; military and UAV only &middot; positions, not landings` +
              `</div>`
            );
          })()
        )
        .addTo(layer.current);
    });
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
    // days/ageH are PRINTED in the popups, so a change to either must redraw them. Relying on
    // `data` changing is indirect and breaks when a fetch fails or is still in flight.
  }, [data, radius, days, ageH]);

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
      <div ref={box} style={{ height: full ? "auto" : 380, flex: full ? 1 : undefined,
        borderRadius: 4, overflow: "hidden", background: "#0A0D12" }} />
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

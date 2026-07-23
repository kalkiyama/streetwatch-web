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

export default function HeatMap({ days: initialDays = 7, height = "min(68vh, 620px)" }) {
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
      const radiusNm = radius === "field" ? 10 : radius;
      const nearNm = data.nearRadiusNm || 25;
      const col = heatColor(t);
      Leaflet.circleMarker([s.lat, s.lon], {
        radius: 5 + t * 16,
        color: col, weight: 1.5, fillColor: col, fillOpacity: 0.35,
      })
        .bindPopup(
          // The headline number counts a 250nm REGION. Saying "351 contacts" beside a base
          // name reads as 351 aircraft at that base — which is how Findel, a civil airport
          // ringed by military airspace, came to look like the sixth busiest site on earth.
          `<b>${s.site}</b><br>${s.country || ""}<br>` +
          (radius === "field"
            ? `<b>${shown}</b> aircraft observed within 10nm and below 4,000ft — consistent with using this field<br>`
            : `<b>${shown}</b> aircraft within ${radiusNm}nm · ${pick.u ?? s.uav} UAV · ${pick.m ?? s.military} military<br>`) +
          (radius !== 250 && s.contacts != null
            ? `<span style="opacity:.75">${s.contacts} within the full 250nm sweep radius</span><br>`
            : s.near_contacts != null
              ? `<b>${s.near_contacts}</b> of them within ${nearNm}nm of the site itself<br>`
              : "") +
          // If the per-radius count isn't in the payload yet (older backend), fall back to the
          // region-wide figure — but LABEL IT AS REGION-WIDE. A wrong label is worse than a
          // missing feature; that exact mistake is how 344 became "at Eglin".
          (s.low25 != null
            ? `<span style="opacity:.85">by lowest altitude seen: ${s.low25} below 10,000ft · ${s.mid25} at 10–25,000ft · ${s.high25} above 25,000ft</span><br>` +
              `<span style="opacity:.7">${s.terminal_contacts || 0} ${(s.terminal_contacts === 1 ? "was" : "were")} within 10nm AND below 4,000ft — consistent with using this field rather than passing over it. Positions only: we never observe a landing.</span><br>`
            : "") +
          (pick.p != null
            ? `${pick.p} position report${pick.p === 1 ? "" : "s"} within ${radiusNm}nm, spanning ${s.span_hours || 0}h of recorded data<br>`
            : `${s.points} position report${s.points === 1 ? "" : "s"} across the 250nm region, spanning ${s.span_hours || 0}h of recorded data<br>`) +
          `<span style="opacity:.7">last seen ${new Date(s.last_seen).toLocaleString()}</span>`
        )
        .addTo(layer.current);
    });
    setTimeout(() => map.current && map.current.invalidateSize(), 60);
  }, [data, radius]);

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
            title="Rank by aircraft observed within 10nm and below 4,000ft — activity at the field itself, not the airspace around it"
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
          ? "Colour ranks sites by aircraft seen within 10nm below 4,000ft — activity at the field itself."
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

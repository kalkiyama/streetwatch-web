import { useEffect, useState } from "react";
import { PlaneLanding, PlaneTakeoff, ChevronLeft } from "lucide-react";
import { C, fmtTs } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// OPERATIONS — what actually USED an airfield, rather than what was near it.
//
// Every other count in this product is PROXIMITY. "21 military/UAV low and close" means 21 aircraft
// were within 10nm below 4,000ft — which includes aircraft holding, going around, or transiting a
// valley below a ridge. The footer says so, because the radius bands structurally cannot say more.
// This counts EVENTS instead: a track that ENDS at a site is an arrival, one that BEGINS there is a
// departure. Same method discover-airfields.js uses to find uncatalogued airfields, validated at
// 95%, and it found Raumai Air Weapons Range — a facility in no airfield database anywhere.
//
// THREE THINGS THE PANEL HAS TO SAY, and each is here because leaving it out would mislead:
//
// 1. IT IS AN INFERENCE, never an observed landing. A track ending near a field WITH THE SITE STILL
//    OBSERVING is strong evidence. Nothing in public ADS-B can be more than that.
// 2. IT COUNTS TRAFFIC BETWEEN PLACES, not activity at a place. Local circuit training never leaves
//    the 10nm radius, so those flights never end a track here and are not counted. Whiting Field is
//    among the busiest training fields in the world and shows tens per week, not the hundreds per
//    day it actually flies. Unlabelled, that reads as a broken tool.
// 3. IT LAGS BY ABOUT A DAY. An event is confirmed only once the observation clock has run 4h past
//    it AND the site has been polled again — up to 40h on the cold tier. So "last 7 days" is the
//    QUERY window; confirmedThrough is where the data actually ends. Showing the first without the
//    second would imply a currency the method cannot have.
//
// ARRIVALS AND DEPARTURES BALANCE CLOSELY at almost every site — Corpus Christi 26/25, Andrews
// 26/25, Akrotiri 6/6. Nobody designed that: aircraft that land take off again, so a method
// measuring both sides honestly produces near-parity. It falls out of the data, and it is the best
// evidence the method works.

export default function OperationsPanel({ days = 7 }) {
  const [data, setData] = useState(null);
  const [site, setSite] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    // setErr(null) used to run here, synchronously on every effect pass — React Compiler flags
    // that as a cascading render, and it is one: the effect re-runs on every site or days change.
    // Clearing on SUCCESS instead is also more correct, because a failed fetch should not blank
    // the previous error before the new one arrives.
    const url = site
      ? `${BACKEND_URL}/api/drones/operations?site=${encodeURIComponent(site)}&days=${days}&limit=200`
      : `${BACKEND_URL}/api/drones/operations?days=${days}&limit=1`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (alive) { setErr(null); if (site) setDetail(j); else setData(j); } })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [site, days]);

  const meta = detail || data;
  const through = meta?.confirmedThrough;
  const since = meta?.recordedSince;

  if (err) return (
    <div className="px-4 py-6" style={{ fontSize: 11.5, color: C.dim }}>
      Operations unavailable ({err}).
    </div>
  );

  // ---- one site ----
  if (site) {
    const s = detail?.summary;
    const ops = detail?.operations || [];
    return (
      <div className="px-3 pb-3">
        <button onClick={() => { setSite(null); setDetail(null); }}
          className="flex items-center gap-1 font-mono mb-2"
          style={{ fontSize: 10, color: C.dim, background: "none", border: "none", padding: "4px 0" }}>
          <ChevronLeft size={12} />ALL SITES
        </button>
        <div style={{ fontSize: 13.5, color: C.text, marginBottom: 2 }}>{site}</div>
        {s && (
          <div className="font-mono" style={{ fontSize: 12, color: C.text, marginBottom: 8 }}>
            <span style={{ color: "#37C46A" }}>{s.arrivals}</span> arrival{s.arrivals === 1 ? "" : "s"}
            {" · "}<span style={{ color: C.amber }}>{s.departures}</span> departure{s.departures === 1 ? "" : "s"}
            {" · "}{s.airframes} airframe{s.airframes === 1 ? "" : "s"}
          </div>
        )}
        {ops.length === 0 && (
          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
            No confirmed operations here in this window. That is not the same as nothing happening —
            an aircraft that stays inside the radius never ends a track, and events are only
            confirmed after the site has been polled again.
          </div>
        )}
        {/* TWO LINES PER EVENT, not one. A single flex row with fixed minWidths for callsign,
            hex, description and a UTC timestamp does not fit the drone panel's width and the
            columns collided. Identity on the first line, aircraft type on the second. */}
        {ops.map((o, i) => (
          <div key={`${o.icao}-${o.ev}-${o.ts}-${i}`} className="py-1.5"
            style={{ borderBottom: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-1.5">
              {o.ev === "arrival"
                ? <PlaneLanding size={12} color="#37C46A" style={{ flexShrink: 0 }} />
                : <PlaneTakeoff size={12} color={C.amber} style={{ flexShrink: 0 }} />}
              {/* Explicit margins rather than the flex gap class — the gap was not applying and
                  the callsign, hex and timestamp ran together as one string. */}
              <span className="font-mono" style={{ fontSize: 11.5, color: C.text, marginLeft: 4 }}>
                {o.callsign || "—"}
              </span>
              <span className="font-mono" style={{ fontSize: 10, color: C.dim, marginLeft: 8 }}>{o.icao}</span>
              <span className="font-mono ml-auto" style={{ fontSize: 9.5, color: C.faint, flexShrink: 0, marginLeft: "auto", paddingLeft: 10 }}>
                {fmtTs(o.ts)}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.4, marginLeft: 18,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {o.descr || o.type_code || "unknown type"}
            </div>
          </div>
        ))}
        <Scope through={through} since={since} />
      </div>
    );
  }

  // ---- ranked ----
  const sites = data?.sites || [];
  return (
    <div className="px-3 pb-3">
      {!data && <div className="font-mono py-4" style={{ fontSize: 10, color: C.faint }}>loading…</div>}
      {sites.map((x) => {
        const total = x.arrivals + x.departures;
        const max = Math.max(1, ...sites.map((y) => y.arrivals + y.departures));
        return (
          <button key={x.site} onClick={() => setSite(x.site)}
            className="sw-row w-full text-left py-2 flex items-center gap-2"
            style={{ borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 12, color: C.text, flex: 1, minWidth: 0 }}>{x.site}</span>
            <span className="font-mono" style={{ fontSize: 10.5, color: "#37C46A", minWidth: 26, textAlign: "right" }}>{x.arrivals}</span>
            <span className="font-mono" style={{ fontSize: 10.5, color: C.amber, minWidth: 26, textAlign: "right" }}>{x.departures}</span>
            <span style={{ width: 46, height: 3, background: C.panel2, borderRadius: 2, flexShrink: 0 }}>
              <span style={{ display: "block", height: "100%", borderRadius: 2,
                width: `${(total / max) * 100}%`, background: "#C084FC", opacity: 0.75 }} />
            </span>
          </button>
        );
      })}
      {data && sites.length === 0 && (
        <div className="py-4" style={{ fontSize: 11.5, color: C.dim }}>
          No operations confirmed in this window yet.
        </div>
      )}
      <div className="font-mono flex gap-3 pt-1.5" style={{ fontSize: 9, color: C.faint }}>
        <span style={{ color: "#37C46A" }}>■ arrivals</span>
        <span style={{ color: C.amber }}>■ departures</span>
      </div>
      <Scope through={through} since={since} />
    </div>
  );
}

// THE THREE CAVEATS, IN ONE PLACE, on both views. Each is here because omitting it would let a
// reader draw a stronger conclusion than the data supports — which is the failure this product
// exists to avoid.
function Scope({ through, since }) {
  return (
    <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.55, marginTop: 8 }}>
      Arrivals from and departures to <b>elsewhere</b> — not total movements. Aircraft that stay
      inside the 10nm radius never end a track here, so a busy training field shows a small number.
      <span style={{ display: "block", marginTop: 3 }}>
        Inferred from where tracks end and begin, never an observed landing.
      </span>
      {through && (
        <span style={{ display: "block", marginTop: 3 }}>
          Confirmed through {fmtTs(through)}
          {since ? ` · recorded since ${fmtTs(since)}` : ""} — events are only confirmed once the
          site has been polled again, so this lags by about a day.
        </span>
      )}
    </div>
  );
}

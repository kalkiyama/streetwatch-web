import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Strategic-asset watch.
//
// WHAT THIS SAYS AND WHAT IT DOES NOT. "Nuclear-capable" is a property of the TYPE. A B-52H is
// certified to carry nuclear weapons; that is published and uncontroversial. Whether the one
// airborne today is carrying anything is not broadcast, cannot be observed, and is not claimed
// here.
//
//   "B-52H — a nuclear-capable bomber type" is true.
//   "Nuclear bomber flight detected" describes the sortie and would be invented.
//
// The limits are rendered, not buried: payload cannot be seen, Russian and Chinese types do not
// broadcast at all, and vessels are live-only because ship movements are deliberately not archived.
//
// THE B-1B IS NOT NUCLEAR-CAPABLE and is the most frequent entry here. It was denuclearised under
// New START in 2011. Labelling every bomber nuclear would be the easy error; the panel marks each
// one as the type actually is.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOWS = [
  [360, "6h"], [1440, "24h"], [10080, "7d"], [43200, "30d"], [129600, "90d"],
];

const ago = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};

export default function StrategicWatch({ onShowOnMap }) {
  const [minutes, setMinutes] = useState(1440);
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [why, setWhy] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`${BACKEND_URL}/api/strategic?minutes=${minutes}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState(j ? "ok" : "error"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [minutes]);

  const list = (data && data.aircraft) || [];

  return (
    <div className="rounded-lg font-mono" style={{
      border: `1px solid ${C.amber}55`, background: "rgba(246,168,33,0.06)", padding: "8px 10px" }}>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5" style={{ color: C.amber, fontSize: 10, letterSpacing: 1 }}>
          <AlertTriangle size={12} /> STRATEGIC WATCH
        </span>
        <span style={{ flex: 1 }} />
        {/* The window is the reader's choice because a bomber sighting is RARE. An empty six hours
            is normal and says nothing; ninety days is where the pattern lives. A panel fixed at
            "now" would be blank most of the time and would read as a fault. */}
        {WINDOWS.map(([v, label]) => (
          <button key={v} onClick={() => setMinutes(v)} className="rounded"
            style={{ fontSize: 9, padding: "2px 7px",
              color: minutes === v ? "#04121F" : C.amber,
              background: minutes === v ? C.amber : "transparent",
              border: `1px solid ${C.amber}66` }}>
            {label}
          </button>
        ))}
      </div>

      {state === "loading" && (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>reading the archive…</div>
      )}

      {state === "error" && (
        <div style={{ fontSize: 10.5, color: C.amber, marginTop: 6 }}>
          the archive is not answering right now
        </div>
      )}

      {state === "ok" && list.length === 0 && (
        // NOT an alarm state, and not a failure. Said plainly, because a blank panel would read as
        // broken and a worried one would be dishonest.
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>
          No strategic bomber types recorded in this window. That is the usual state — try a longer
          one.
        </div>
      )}

      {state === "ok" && list.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {list.slice(0, 8).map((a) => (
            <div key={a.icao} style={{ padding: "5px 0", borderTop: `1px solid ${C.amber}22` }}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.label}</span>
                <span style={{ fontSize: 10.5, color: C.dim }}>{a.callsign || a.icao.toUpperCase()}</span>
                {/* THE CAPABILITY, of the type. Amber where it applies, and an explicit contrary
                    note where it does not — the B-1B carries one saying it is conventional only,
                    because it is the most frequent entry here and would otherwise be assumed. */}
                {a.nuclearCapableType
                  ? <span style={{ fontSize: 9.5, color: C.amber, letterSpacing: 0.4 }}>
                      NUCLEAR-CAPABLE TYPE
                    </span>
                  : <span style={{ fontSize: 9.5, color: C.faint }}>conventional type</span>}
              </div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2, lineHeight: 1.5 }}>
                {a.firstSite && a.lastSite && a.firstSite !== a.lastSite
                  ? <>first seen at <b style={{ color: C.text }}>{a.firstSite}</b>, last at <b style={{ color: C.text }}>{a.lastSite}</b></>
                  : <>seen at <b style={{ color: C.text }}>{a.lastSite || a.firstSite || "an unnamed cell"}</b></>}
                {" · "}{a.radars} radar{a.radars === 1 ? "" : "s"}
                {a.altFt != null ? ` · ${a.altFt.toLocaleString()}ft` : ""}
                {" · "}{ago(a.lastSeen)}
                {a.typeNote ? <span style={{ display: "block", color: C.faint, fontSize: 9.5 }}>{a.typeNote}</span> : null}
              </div>
              {a.lat != null && a.lon != null && (
                <button onClick={() => onShowOnMap && onShowOnMap(a)} className="rounded"
                  style={{ fontSize: 9, padding: "2px 8px", marginTop: 3, color: C.cyan,
                    background: "rgba(34,211,238,0.10)", border: `1px solid ${C.cyan}55` }}>
                  Show where it was →
                </button>
              )}
            </div>
          ))}
          {list.length > 8 && (
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>
              and {list.length - 8} more in this window
            </div>
          )}
        </div>
      )}

      <button onClick={() => setWhy((v) => !v)} className="rounded"
        style={{ fontSize: 9, padding: "1px 6px", marginTop: 6, color: C.amber,
          background: "rgba(246,168,33,0.10)", border: `1px solid ${C.amber}55` }}>
        {why ? "Less" : "What this can and cannot see"}
      </button>

      {why && data && data.limits && (
        <div style={{ fontSize: 9.5, color: C.faint, marginTop: 5, lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 4px" }}>
            <b style={{ color: C.dim }}>Capability is a fact about the type.</b> {data.limits.payload}
          </p>
          <p style={{ margin: "0 0 4px" }}>{data.limits.coverage}</p>
          <p style={{ margin: "0 0 4px" }}>{data.limits.ads_b}</p>
          <p style={{ margin: 0 }}>{data.limits.vessels}</p>
        </div>
      )}
    </div>
  );
}

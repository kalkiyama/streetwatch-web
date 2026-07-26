import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// ROUTES — the same aircraft observed low and close at several airfields in sequence.
//
// Every other view in this app aggregates PER SITE. This one follows ONE AIRFRAME across sites,
// which is the only way a logistics pattern becomes visible: load, fly, unload, fly again.
//
// The display's whole job is to keep evidence weight visible. A stop backed by one sighting and a
// stop backed by six hours of continuous tracking are not the same claim, and rendering them
// identically would invite equal belief in both — so evidence is shown per stop, and itineraries
// are ordered by how much of their route is well-evidenced rather than by how many stops they have.

const EVIDENCE = {
  sustained:         { color: C.text,  label: "sustained", hint: "5+ observations over 20+ minutes" },
  repeated:          { color: "#F6A821", label: "repeated", hint: "seen more than once, or over several minutes" },
  "single sighting": { color: C.faint, label: "single",    hint: "one sweep caught it low and close — consistent with a stop, and equally consistent with an approach it flew away from" },
};

export default function RouteTrace({ days = 7 }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`${BACKEND_URL}/api/drones/multistop?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (alive) { setData(j); setState("ok"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [days]);

  if (state === "loading") {
    return <div className="px-3 pb-3 font-mono" style={{ fontSize: 11, color: C.dim }}>tracing routes across the archive…</div>;
  }
  if (state === "error") {
    return <div className="px-3 pb-3 font-mono" style={{ fontSize: 11, color: "#F0553B" }}>could not read routes just now.</div>;
  }
  if (!data) return null;

  const list = data.aircraft || [];

  return (
    <div className="px-3 pb-3">
      <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginBottom: 8 }}>
        Aircraft seen <b style={{ color: C.text }}>within 10nm and below 4,000ft</b> at two or more
        airfields over the last {days} day{days > 1 ? "s" : ""} — the trace a multi-leg run leaves.
        <span style={{ display: "block", color: C.faint, fontSize: 10, marginTop: 3 }}>
          Positions only, never an observed landing. A gap between stops means it was not seen in
          between, not that it flew directly. Ordered by how much of each route is well-evidenced.
        </span>
      </div>

      {list.length === 0 && (
        <div className="font-mono" style={{ fontSize: 11, color: C.faint }}>
          No aircraft met the criteria in this window. That is a statement about what the rotating
          sweep caught, not about what flew.
        </div>
      )}

      {list.map((a) => {
        const isOpen = open === a.icao;
        const name = (a.callsigns && a.callsigns[0]) || a.callsign || a.icao.toUpperCase();
        return (
          <div key={a.icao} style={{ borderTop: "1px solid rgba(192,132,252,0.18)" }}>
            <button
              onClick={() => setOpen(isOpen ? null : a.icao)}
              className="w-full flex items-start gap-2 py-2 text-left"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}>
              {isOpen ? <ChevronDown size={12} style={{ color: "#C084FC", marginTop: 2, flexShrink: 0 }} />
                      : <ChevronRight size={12} style={{ color: "#C084FC", marginTop: 2, flexShrink: 0 }} />}
              <span className="flex-1" style={{ minWidth: 0 }}>
                <span style={{ color: "#C084FC", fontSize: 12, fontWeight: 700 }}>{name}</span>
                {a.callsignChanges > 0 && (
                  /* The callsign is set per MISSION, not per airframe. Several across one itinerary
                     is ordinary practice — reported as an observation, with no motive attached. */
                  <span style={{ color: C.faint, fontSize: 10 }}>
                    {` +${a.callsignChanges} more callsign${a.callsignChanges > 1 ? "s" : ""}`}
                  </span>
                )}
                <span style={{ display: "block", color: C.text, fontSize: 11, marginTop: 1, overflowWrap: "anywhere" }}>
                  {a.route}
                </span>
                <span style={{ display: "block", color: C.faint, fontSize: 10, marginTop: 1 }}>
                  {a.typeCode ? `${a.typeCode} · ` : ""}{a.stopCount} stops over {a.spanHours}h
                  {" · "}
                  <span style={{ color: a.sustainedStops > 0 ? C.text : C.faint }}>
                    {a.sustainedStops} well-evidenced
                  </span>
                  {a.singleSightingStops > 0 ? ` · ${a.singleSightingStops} on a single sighting` : ""}
                </span>
              </span>
            </button>

            {isOpen && (
              <div style={{ paddingLeft: 20, paddingBottom: 8 }}>
                {a.callsigns && a.callsigns.length > 1 && (
                  <div className="font-mono" style={{ fontSize: 10, color: C.faint, marginBottom: 5 }}>
                    callsigns observed: {a.callsigns.join(" · ")}
                  </div>
                )}
                {/* Stacked, not tabular. A five-column nowrap table cannot fit the resizable
                    panel at its narrower widths, and the horizontal scroll that hid the overflow
                    was itself invisible on macOS until you happened to scroll — content silently
                    cut off with no cue it existed. Two wrapping lines per stop always fit. */}
                {a.stops.map((s, i) => {
                  const ev = EVIDENCE[s.evidence] || EVIDENCE["single sighting"];
                  return (
                    <div key={i} style={{ marginBottom: 6, paddingLeft: 8,
                      borderLeft: `2px solid ${ev.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: C.text, fontSize: 11.5, overflowWrap: "anywhere" }}>
                          {s.site}
                        </span>
                        <span style={{ color: ev.color, fontSize: 10, whiteSpace: "nowrap" }}
                          title={ev.hint}>
                          {ev.label}
                        </span>
                      </div>
                      <div className="font-mono" style={{ color: C.faint, fontSize: 10,
                        marginTop: 1, overflowWrap: "anywhere" }}>
                        {s.callsign || "no callsign recorded"}
                        {" · "}{String(s.firstSeen).slice(11, 16)}&ndash;{String(s.lastSeen).slice(11, 16)}
                        {" · "}{s.observedMinutes}min
                        {" · "}{s.points} observation{s.points === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 9.5, color: C.faint, marginTop: 5, lineHeight: 1.5 }}>
                  Times are the observed span inside the terminal area — a lower bound, not a dwell
                  time. Neighbouring airfields under ~20nm apart can both register one approach.
                </div>
              </div>
            )}
          </div>
        );
      })}

      {list.length > 0 && (
        <div style={{ fontSize: 9.5, color: C.faint, marginTop: 8, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
          Itineraries follow the aircraft&rsquo;s ICAO address, so a change of callsign between legs
          keeps one itinerary. If the ICAO address itself changes, the legs cannot be linked and this
          watch does not guess.
        </div>
      )}
    </div>
  );
}

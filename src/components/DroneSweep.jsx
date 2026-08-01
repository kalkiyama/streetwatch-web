import { useState, useEffect } from "react";
import { RefreshCw, Radio, History, X } from "lucide-react";
import { C } from "../theme.js";
import { lookupCallsign } from "../callsigns.js";
import TrackNarrative from "./TrackNarrative.jsx";
import AiBriefing from "./AiBriefing.jsx";
import HeatMap from "./HeatMap.jsx";
import RouteTrace from "./RouteTrace.jsx";
import { BACKEND_URL } from "../config.js";

// Planet-wide view of ADS-B category B6 (unmanned) contacts, aggregated
// server-side so every user shares one sweep of the watched airspaces.

// The recorded path for one archived contact, drawn inline under its row.
function PathView({ track, onClose }) {
  return (
        <div className="px-3 py-2.5" style={{ borderTop: "1px solid rgba(192,132,252,0.35)", background: "rgba(10,14,20,0.6)" }}>
          <div className="flex items-center justify-between font-mono" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1 }}>
            <span>PATH · {track.contact.callsign || track.contact.icao.toUpperCase()}</span>
            <button onClick={onClose} aria-label="close" style={{ color: "#C084FC" }}><X size={13} /></button>
          </div>
          {!track.points && <div className="mt-1.5" style={{ fontSize: 11, color: C.dim }}>loading path…</div>}
          {track.points && track.points.length === 0 && (
            <div className="mt-1.5" style={{ fontSize: 11, color: C.dim }}>No stored positions for this contact.</div>
          )}
          {track.points && track.points.length > 0 && (() => {
            const pts = track.points.map((p) => ({ lat: p.lat, lon: p.lon, ts: +new Date(p.ts) }));
            const km = pts.slice(1).reduce((acc, p, i) => {
              const q = pts[i]; const dy = (p.lat - q.lat) * 111;
              const dx = (p.lon - q.lon) * 111 * Math.cos((p.lat * Math.PI) / 180);
              return acc + Math.hypot(dx, dy);
            }, 0);
            return (
              <>
                <TrackNarrative icao={track.contact.icao} />
                <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
                  {pts.length} recorded positions · {km.toFixed(0)}km of track
                  <span style={{ display: "block" }}>
                    {new Date(pts[0].ts).toLocaleString()} → {new Date(pts[pts.length - 1].ts).toLocaleString()}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
  );
}

export default function DroneSweep({ onOpen, onOpenVessel }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [mins, setMins] = useState(60);
  const [kind, setKind] = useState("all");
  const [marine, setMarine] = useState(null);   // { usv, sub } — sea drones and sub support
  const [mode, setMode] = useState("live");     // live | archive
  const [days, setDays] = useState(7);
  const [hist, setHist] = useState(null);       // archived contact list
  const [histState, setHistState] = useState("idle");
  const [track, setTrack] = useState(null);     // { contact, points }

  useEffect(() => {
    if (mode !== "live") return;          // don't poll the live sweep while reading the archive
    let alive = true;
    async function load() {
      if (!BACKEND_URL) { setState("error"); return; }
      try {
        const r = await fetch(`${BACKEND_URL}/api/drones?mins=${mins}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!alive) return;
        setData(j); setState("ok");
        // The map has offered SEA DRONES and SUB SUPPORT layers for a while; the list only
        // ever fetched aircraft, so the same contacts were reachable on one surface and
        // invisible on the other. Fetched separately so a marine outage cannot blank the
        // aircraft list.
        Promise.all([
          fetch(`${BACKEND_URL}/api/usv`).then((x) => x.json()).catch(() => null),
          fetch(`${BACKEND_URL}/api/subsupport`).then((x) => x.json()).catch(() => null),
        ]).then(([u, sb]) => { if (alive) setMarine({ usv: u, sub: sb }); });
      } catch { if (alive) setState((s) => (s === "ok" ? "ok" : "error")); }
    }
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [mins, mode]);

  useEffect(() => {
    if (mode !== "archive") return;
    let alive = true;
    setHistState("loading");
    fetch(`${BACKEND_URL}/api/drones/history?days=${days}&limit=200`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { if (alive) { setHist(j); setHistState("ok"); } })
      .catch((e) => { if (alive) setHistState(String(e.message) === "503" ? "off" : "error"); });
    return () => { alive = false; };
  }, [mode, days]);

  const openTrack = async (c) => {
    setTrack({ contact: c, points: null });
    try {
      const r = await fetch(`${BACKEND_URL}/api/drones/track?id=${encodeURIComponent(c.icao)}`);
      const j = await r.json();
      const pts = j.points || (j.track || []).map((t) => ({ lat: t[0], lon: t[1], ts: t[2] }));
      setTrack({ contact: c, points: pts });
    } catch { setTrack({ contact: c, points: [] }); }
  };

  const all = (data && data.drones) || [];
  const drones = kind === "all" ? all : (kind === "usv" || kind === "sub") ? [] : all.filter((d) => d.kind === kind);
  const vessels = kind === "usv" ? ((marine && marine.usv && marine.usv.vessels) || [])
                : kind === "sub" ? ((marine && marine.sub && marine.sub.vessels) || [])
                : [];
  const KIND = { uav: { c: "#C084FC", label: "UAV" }, military: { c: "#F87171", label: "MIL" } };
  const styleOf = (d) => (d.confidence === "disputed"
    ? { c: "#F6A821", label: "UAV?" }
    : (KIND[d.kind] || KIND.uav));
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
  };

  return (
    <div className="mx-4 mt-2 mb-1 rounded" style={{ background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.35)" }}>
      <div className="px-3 py-2 flex items-center justify-between font-mono" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1, flexWrap: "wrap", gap: 6 }}>
        <span className="flex items-center gap-1.5"><Radio size={11} /> GLOBAL SWEEP</span>
        <span className="flex items-center gap-1">
          <span className="font-mono" style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 4 }}>VIEW</span>
          <span className="flex rounded overflow-hidden" style={{ border: "1px solid rgba(192,132,252,0.45)" }}>
            {[["live", "LIVE"], ["archive", "ARCHIVE"], ["heat", "ACTIVITY"], ["routes", "ROUTES"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setTrack(null); }}
                title={m === "live" ? "Contacts detected right now" : m === "archive" ? "Everything recorded over the last 90 days" : m === "heat" ? "Where activity concentrates, measured from the archive" : "One aircraft across several airfields — the trace a multi-leg run leaves"}
                style={{ fontSize: 9, padding: "2px 7px", border: "none",
                  background: mode === m ? "#C084FC" : "transparent", color: mode === m ? "#0A0E14" : "#C084FC" }}>
                {label}
              </button>
            ))}
          </span>
        </span>
      </div>

      <div className="px-3 pb-1.5" style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
        Military &amp; UAV watch · air and sea
        <span style={{ display: "block", fontSize: 10, color: C.faint, fontWeight: 400, marginTop: 1 }}>
          {mode === "live"
            ? `${drones.length} aircraft now · ${((marine && marine.usv && marine.usv.count) || 0) + ((marine && marine.sub && marine.sub.count) || 0)} vessels of interest · ${(data && data.sweep && data.sweep.sites) || 0} airspaces`
            : mode === "heat"
              ? `Where activity concentrates over ${days} day${days > 1 ? "s" : ""} — tap a circle for detail`
              : mode === "routes"
                ? `One aircraft across several airfields over ${days} day${days > 1 ? "s" : ""} — tap to see each stop`
                : `${(hist && hist.count) || 0} recorded · archive keeps 90 days`}
        </span>
      </div>

      {/* time-window buttons on their own line so nothing runs off a narrow screen */}
      <div className="px-3 pb-2 flex items-center gap-1 font-mono" style={{ flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: C.faint, marginRight: 2 }}>{mode === "live" ? "SEEN IN" : "LOOK BACK"}</span>
        {(mode === "live" ? [[60, "1h"], [360, "6h"], [1440, "24h"]] : [[1, "1d"], [7, "7d"], [30, "30d"], [90, "90d"]]).map(([v, label]) => {
          const active = mode === "live" ? mins === v : days === v;
          return (
            <button key={v} onClick={() => (mode === "live" ? setMins(v) : setDays(v))}
              style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: "1px solid rgba(192,132,252,0.4)",
                background: active ? "#C084FC" : "transparent", color: active ? "#0A0E14" : "#C084FC" }}>
              {label}
            </button>
          );
        })}
      </div>

      {mode === "archive" && (
        <div className="px-3 pb-2"><AiBriefing days={days} /></div>
      )}

      {mode === "live" && state === "ok" && (
        <div className="px-3 pb-1.5" style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.5 }}>
          Coverage is uneven: the ADS-B receiver network is volunteer-fed and dense over North
          America, Europe and Japan, sparse over Russia, China, Central Asia, Africa and most
          oceans — and many air forces do not broadcast at all. An airspace showing nothing
          means nothing was <i>visible</i> there, not that nothing happened.
          <span style={{ display: "block", marginTop: 3 }}>
            Nothing here is verified by StreetWatch. An aircraft is listed as military because a
            public aircraft database flags its transponder code, and as a UAV because a registry
            names the type or the aircraft broadcasts the unmanned category itself. ADS-B is
            unauthenticated — it carries no signature, so a misconfigured or deliberately false
            broadcast looks identical to a true one. Each contact shows the basis for its label.
          </span>
        </div>
      )}
      {/* Only shown when running on a FALLBACK upstream. Silent when normal, because a notice that
          is always on is wallpaper. A different provider means a different receiver network, so
          coverage differs — "nothing visible here" means something different, and that has to be
          said rather than quietly absorbed. */}
      {mode === "live" && state === "ok" && data.upstream && data.upstream !== "airplanes.live" && (
        <div className="px-3 pb-1.5" style={{ fontSize: 10, color: "#F6A821", lineHeight: 1.5 }}>
          Serving from fallback source <b>{data.upstream}</b> — the primary feed is unavailable.
          Coverage differs between receiver networks, so counts may not match earlier readings.
        </div>
      )}
      {mode === "live" && state === "ok" && data.sweep && data.sweep.cycles === 0 && (
        <div className="px-3 pb-1.5" style={{ fontSize: 10, color: C.dim }}>
          First sweep in progress — {data.sweep.visited}/{data.sweep.passSize || data.sweep.sites} airspaces checked this pass.
          Counts keep rising until the full pass completes.
        </div>
      )}
      {mode === "live" && state === "ok" && (
        <div className="px-3 pb-2 flex items-center gap-1 font-mono">
          {[["all", "ALL", "#C084FC"], ["uav", `UAV ${(data.counts && data.counts.uav) || 0}`, "#C084FC"], ["military", `MIL ${(data.counts && data.counts.military) || 0}`, "#F87171"],
            ["usv", `SEA ${(marine && marine.usv && marine.usv.count) || 0}`, "#2DD4BF"],
            ["sub", `SUB ${(marine && marine.sub && marine.sub.count) || 0}`, "#F0553B"]].map(([k, label, col]) => (
            <button key={k} onClick={() => setKind(k)}
              style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${col}66`,
                background: kind === k ? col : "transparent", color: kind === k ? "#0A0E14" : col }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "heat" && <HeatMap days={days} />}

      {mode === "routes" && <RouteTrace days={days} />}

      {mode === "archive" && (
        <>
          <div className="px-3 pb-2" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
            Recorded sightings from the last {days} day{days > 1 ? "s" : ""} — <b style={{ color: C.text }}>tap any contact to replay its flight path.</b>
          </div>
          {histState === "loading" && <div className="px-3 pb-2 font-mono" style={{ fontSize: 11, color: C.dim }}>reading the archive…</div>}
          {histState === "off" && <div className="px-3 pb-2" style={{ fontSize: 11, color: C.dim }}>No archive configured on this instance.</div>}
          {histState === "error" && <div className="px-3 pb-2" style={{ fontSize: 11, color: C.dim }}>Archive unavailable right now.</div>}
          {histState === "ok" && hist.count === 0 && (
            <div className="px-3 pb-2.5" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
              Nothing recorded in the last {days} day{days > 1 ? "s" : ""} yet. The archive began collecting when it was switched on.
            </div>
          )}
          {histState === "ok" && hist.contacts.map((c) => {
            const isOpen = track && track.contact.icao === c.icao;
            const dur = Math.max(1, Math.round((new Date(c.last_seen) - new Date(c.first_seen)) / 60000));
            const st = c.confidence === "disputed" ? { c: "#F6A821", label: "UAV?" } : (KIND[c.kind] || KIND.uav);
            return (
              <div key={c.icao + c.kind}>
              <button onClick={() => (isOpen ? setTrack(null) : openTrack(c))} className="w-full text-left px-3 py-2 flex items-center gap-2"
                style={{ borderTop: "1px solid rgba(192,132,252,0.18)", background: isOpen ? "rgba(192,132,252,0.10)" : "transparent" }}>
                <span style={{ color: st.c, fontSize: 12, fontWeight: 700, minWidth: 74 }}>
                  {c.callsign || c.icao.toUpperCase()}
                  <span style={{ display: "block", fontSize: 8, opacity: 0.75 }}>{st.label}</span>
                </span>
                <span className="flex-1" style={{ fontSize: 11, color: C.text, minWidth: 0 }}>
                  {c.last_site} <span style={{ color: C.faint }}>· {c.last_country}</span>
                  <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
                    {c.descr || c.type_code || "unknown type"} · {c.points} point{c.points > 1 ? "s" : ""} over {dur < 60 ? dur + "min" : Math.round(dur / 60) + "h"}
                    {" · "}{new Date(c.last_seen).toLocaleDateString()}
                  </span>
                </span>
                <span className="font-mono flex items-center gap-1" style={{ fontSize: 9, color: isOpen ? "#C084FC" : C.faint, whiteSpace: "nowrap" }}>
                  <History size={11} />{isOpen ? "HIDE" : "PATH"}
                </span>
              </button>
              {isOpen && <PathView track={track} onClose={() => setTrack(null)} />}
              </div>
            );
          })}
          {histState === "ok" && (
            <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, borderTop: "1px solid rgba(192,132,252,0.18)" }}>
              {hist.count} contacts in {days}d · archive keeps {hist.retainDays} days · public military &amp; UAV aircraft only
            </div>
          )}
        </>
      )}


      {mode === "live" && state === "loading" && (
        <div className="px-3 pb-2 font-mono flex items-center gap-1.5" style={{ fontSize: 11, color: C.dim }}>
          <RefreshCw size={11} /> scanning airspaces worldwide…
        </div>
      )}
      {mode === "live" && state === "error" && (
        <div className="px-3 pb-2" style={{ fontSize: 11, color: C.dim }}>
          Sweep unavailable right now — individual radars below still work.
        </div>
      )}
      {mode === "live" && state === "ok" && drones.length === 0 && (
        <div className="px-3 pb-2.5" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
          No military or UAV contacts in the last {mins === 1440 ? "24 hours" : mins === 360 ? "6 hours" : "hour"}.
          That is a normal reading — try the 24h window, or open a watch site below.
        </div>
      )}
      {mode === "live" && state === "ok" && (kind === "usv" || kind === "sub") && vessels.length === 0 && (
        <div className="px-3 pb-2.5" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
          No {kind === "usv" ? "sea drone" : "submarine support"} candidates in AIS coverage right now.
          That is a normal reading — coverage is regional (Baltic, Norwegian coast and Svalbard),
          and these vessels are uncommon.
        </div>
      )}
      {mode === "live" && state === "ok" && vessels.map((v) => (
        <button key={v.id} onClick={() => onOpenVessel && onOpenVessel(v)}
          className="w-full text-left px-3 py-2 flex items-center gap-2"
          style={{ background: "transparent", border: "none", borderTop: "1px solid rgba(192,132,252,0.18)", cursor: "pointer" }}>
          <span style={{ color: kind === "usv" ? "#2DD4BF" : "#F0553B", fontSize: 12, fontWeight: 700, minWidth: 74 }}>
            {v.name || v.id}
            <span style={{ display: "block", fontSize: 8, opacity: 0.75 }}>
              {kind === "usv"
                ? (v.usvConfidence === "name_match" ? "SEA DRONE" : "POSSIBLE")
                : (v.subSupportConfidence === "named" ? "SUB SUPPORT" : "POSSIBLE")}
            </span>
          </span>
          <span className="flex-1" style={{ fontSize: 11, color: C.text, minWidth: 0 }}>
            {v.callSign ? `${v.callSign} · ` : ""}MMSI {v.id}
            <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
              {v.why || (kind === "sub" ? "surface ship supporting underwater operations — not a submarine" : "small unidentified hull")}
              {Number.isFinite(v.lengthM) ? ` · ${Math.round(v.lengthM)}m` : ""}
              {Number.isFinite(v.sogKt) ? ` · ${v.sogKt.toFixed(1)}kt` : ""}
              {v.provider ? ` · via ${v.provider}` : ""}
            </span>
          </span>
        </button>
      ))}
      {mode === "live" && state === "ok" && drones.map((d) => (
        <button key={d.id} onClick={() => onOpen(d)}
          className="w-full text-left px-3 py-2 flex items-center gap-2"
          style={{ borderTop: "1px solid rgba(192,132,252,0.18)" }}>
          <span style={{ color: styleOf(d).c, fontSize: 12, fontWeight: 700, minWidth: 74 }}>
            {d.callsign || d.id.toUpperCase()}
            <span style={{ display: "block", fontSize: 8, opacity: 0.75 }}>{styleOf(d).label}</span>
          </span>
          <span className="flex-1" style={{ fontSize: 11, color: C.text, minWidth: 0 }}>
            {d.site} <span style={{ color: C.faint }}>· {d.country}</span>
            <span style={{ display: "block", color: C.faint, fontSize: 10 }}>
              {d.desc || d.typeCode || "unknown type"}
              {d.why ? ` · ${d.why}` : ""}
              {d.posMethod ? (
                <span style={{ color: d.posComputed ? "#F6A821" : C.faint }}>
                  {` · pos: ${d.posMethod}`}
                </span>
              ) : ""}
              {(() => {
                // Callsign conventions are a published naming scheme, not an identification.
                // Shown with "callsign" so nobody reads it as a confirmed operator.
                const cs = lookupCallsign(d.callsign);
                return cs ? <span style={{ color: "#C084FC" }}> · {cs.operator} callsign</span> : null;
              })()}
              {d.altFt ? ` · ${(d.altFt / 1000).toFixed(0)}k ft` : ""}
              {d.groundSpeedKt ? ` · ${d.groundSpeedKt}kt` : ""} · {ago(d.lastSeen)}
            </span>
          </span>
        </button>
      ))}
      {mode === "live" && state === "ok" && data.sweep && (
        <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, borderTop: "1px solid rgba(192,132,252,0.18)" }}>
          {data.sweep.cycles} passes · {data.sweep.tracked24h} tracked in 24h
          {data.sweep.hotSites ? (() => {
                  // Say what the sweep is actually doing, including when demand exceeds
                  // capacity. "84 active" alone would imply all 84 are polled every cycle.
                  const s = data.sweep;
                  const mins = s.passSize ? Math.round(s.passSize * 15 / 60) : null;
                  const polled = s.hotPolled != null ? s.hotPolled : s.hotSites;
                  const deferred = s.hotDeferred || 0;
                  return ` · ${s.hotSites} active` +
                    (deferred ? `, ${polled} polled per cycle (${deferred} wait their turn)` : " on fast rotation") +
                    (mins ? ` · ~${mins} min cycle` : "");
                })() : ""}
          {data.counts && data.counts.disputed > 0 && ` · ${data.counts.disputed} disputed (broadcast says unmanned, registry says manned)`}
          {" "}· ADS-B broadcasters only — aircraft with transponders off are invisible to every public feed
        </div>
      )}
    </div>
  );
}

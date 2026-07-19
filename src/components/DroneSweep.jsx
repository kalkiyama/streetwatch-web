import { useState, useEffect } from "react";
import { RefreshCw, Radio } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// Planet-wide view of ADS-B category B6 (unmanned) contacts, aggregated
// server-side so every user shares one sweep of the watched airspaces.
export default function DroneSweep({ onOpen }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | error
  const [mins, setMins] = useState(60);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!BACKEND_URL) { setState("error"); return; }
      try {
        const r = await fetch(`${BACKEND_URL}/api/drones?mins=${mins}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!alive) return;
        setData(j); setState("ok");
      } catch { if (alive) setState((s) => (s === "ok" ? "ok" : "error")); }
    }
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [mins]);

  const all = (data && data.drones) || [];
  const drones = kind === "all" ? all : all.filter((d) => d.kind === kind);
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
      <div className="px-3 py-2 flex items-center justify-between font-mono" style={{ fontSize: 10, color: "#C084FC", letterSpacing: 1 }}>
        <span className="flex items-center gap-1.5"><Radio size={11} /> MILITARY &amp; UAV SWEEP · {drones.length}</span>
        <span className="flex items-center gap-1">
          {[60, 360, 1440].map((m) => (
            <button key={m} onClick={() => setMins(m)}
              style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(192,132,252,0.4)",
                background: mins === m ? "#C084FC" : "transparent", color: mins === m ? "#0A0E14" : "#C084FC" }}>
              {m === 1440 ? "24h" : m === 360 ? "6h" : "1h"}
            </button>
          ))}
        </span>
      </div>

      {state === "ok" && data.sweep && data.sweep.cycles === 0 && (
        <div className="px-3 pb-1.5" style={{ fontSize: 10, color: C.dim }}>
          First sweep in progress — {data.sweep.visited}/{data.sweep.sites} airspaces checked.
          Counts keep rising until the full pass completes.
        </div>
      )}
      {state === "ok" && (
        <div className="px-3 pb-2 flex items-center gap-1 font-mono">
          {[["all", "ALL", "#C084FC"], ["uav", `UAV ${(data.counts && data.counts.uav) || 0}`, "#C084FC"], ["military", `MIL ${(data.counts && data.counts.military) || 0}`, "#F87171"]].map(([k, label, col]) => (
            <button key={k} onClick={() => setKind(k)}
              style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, border: `1px solid ${col}66`,
                background: kind === k ? col : "transparent", color: kind === k ? "#0A0E14" : col }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {state === "loading" && (
        <div className="px-3 pb-2 font-mono flex items-center gap-1.5" style={{ fontSize: 11, color: C.dim }}>
          <RefreshCw size={11} /> scanning 28 airspaces…
        </div>
      )}
      {state === "error" && (
        <div className="px-3 pb-2" style={{ fontSize: 11, color: C.dim }}>
          Sweep unavailable right now — individual radars below still work.
        </div>
      )}
      {state === "ok" && drones.length === 0 && (
        <div className="px-3 pb-2.5" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
          No military or UAV contacts in the last {mins === 1440 ? "24 hours" : mins === 360 ? "6 hours" : "hour"}.
          That is a normal reading — try the 24h window, or open a watch site below.
        </div>
      )}
      {state === "ok" && drones.map((d) => (
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
              {d.altFt ? ` · ${(d.altFt / 1000).toFixed(0)}k ft` : ""}
              {d.groundSpeedKt ? ` · ${d.groundSpeedKt}kt` : ""} · {ago(d.lastSeen)}
            </span>
          </span>
        </button>
      ))}
      {state === "ok" && data.sweep && (
        <div className="px-3 py-1.5 font-mono" style={{ fontSize: 9, color: C.faint, borderTop: "1px solid rgba(192,132,252,0.18)" }}>
          {data.sweep.cycles} cycles · {data.sweep.tracked24h} tracked in 24h
          {data.counts && data.counts.disputed > 0 && ` · ${data.counts.disputed} disputed (broadcast says unmanned, registry says manned)`}
          {" "}· ADS-B broadcasters only — aircraft with transponders off are invisible to every public feed
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { C } from "../theme.js";
import { AIS_BACKEND_URL } from "../config.js";

// "Explain this track" — on demand only.
//
// The layout here enforces the architecture: the COMPUTED measurements are shown first and
// permanently, and the AI sentence sits underneath, labelled. A reader can check the words
// against the numbers without leaving the panel. If the AI is unavailable, the measurements
// still stand on their own — they were never dependent on it.
const Row = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
    <span style={{ color: C.faint }}>{label}</span>
    <span style={{ color: C.dim }}>{value}</span>
  </div>
);

export default function TrackNarrative({ icao }) {
  const [state, setState] = useState("idle");   // idle | loading | done | error
  const [data, setData] = useState(null);

  const run = async () => {
    if (!AIS_BACKEND_URL) { setState("error"); setData({ error: "Backend not configured." }); return; }
    setState("loading");
    try {
      const r = await fetch(`${AIS_BACKEND_URL}/api/ai/track?icao=${encodeURIComponent(icao)}`);
      const j = await r.json();
      setData(j);
      setState("done");
    } catch {
      setData({ error: "Could not reach the analysis service." });
      setState("error");
    }
  };

  if (state === "idle") {
    return (
      <button onClick={run} className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded font-mono"
        style={{ fontSize: 10, color: C.amber, background: "rgba(246,168,33,0.10)",
          border: `1px solid ${C.amber}44` }}>
        <Sparkles size={11} /> EXPLAIN THIS TRACK
      </button>
    );
  }

  if (state === "loading") {
    return <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>measuring track geometry…</div>;
  }

  const g = data && data.geometry;
  return (
    <div className="mt-1.5 rounded" style={{ background: C.panel2, border: `1px solid ${C.line}`, padding: "8px 10px" }}>
      {g && (
        <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.7, marginBottom: 6 }}>
          <div style={{ color: C.amber, letterSpacing: 1, marginBottom: 3 }}>MEASURED · {String(g.verdict).toUpperCase()}</div>
          <Row label="path / net distance" value={`${g.pathNm}nm / ${g.netNm}nm`} />
          <Row label="straightness" value={`${g.straightness} (1.0 = straight line)`} />
          {g.approxLaps > 0.3 && <Row label="accumulated turn" value={`${g.totalTurnDeg}° (~${g.approxLaps} laps)`} />}
          {g.meanRadiusNm != null && <Row label="radius from centre" value={`${g.meanRadiusNm} ± ${g.radiusVarNm} nm`} />}
          {g.meanAltFt != null && <Row label="altitude" value={`${g.meanAltFt.toLocaleString()}ft, spread ${g.altSpreadFt.toLocaleString()}ft`} />}
          {g.meanSpeedKt != null && <Row label="mean ground speed" value={`${g.meanSpeedKt}kt`} />}
          <Row label="duration / points" value={`${g.durationMin}min · ${g.points} positions`} />
        </div>
      )}

      {data && data.narrative && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
          <div className="font-mono" style={{ fontSize: 9.5, color: "#C084FC", letterSpacing: 1, marginBottom: 3,
            display: "flex", alignItems: "center", gap: 4 }}>
            <Sparkles size={10} /> AI INTERPRETATION
          </div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55 }}>{data.narrative}</div>
        </div>
      )}

      {data && !data.narrative && (
        <div className="flex items-start gap-1.5" style={{ fontSize: 10.5, color: C.dim }}>
          <AlertTriangle size={11} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            {data.note || data.error ||
              (data.narrativeStatus === "not_configured"
                ? "Written analysis is not enabled on this instance — the measurements above are unaffected."
                : `Written analysis unavailable (${data.narrativeStatus}). The measurements above are unaffected.`)}
          </span>
        </div>
      )}

      {data && data.disclosure && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
          {data.disclosure}
        </div>
      )}
    </div>
  );
}

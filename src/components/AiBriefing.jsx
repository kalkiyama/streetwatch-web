import { useState } from "react";
import { Sparkles, FileText, GitCompare, AlertTriangle } from "lucide-react";
import { C } from "../theme.js";
import { AIS_BACKEND_URL } from "../config.js";

// Weekly digest + cross-domain correlations.
//
// Same discipline as TrackNarrative: computed figures are shown as a table the reader can
// audit, the AI prose sits below it clearly labelled, and the disclosure is permanent rather
// than a tooltip. Both views are on-demand — nothing here runs on a schedule or per contact.
export default function AiBriefing() {
  const [tab, setTab] = useState("digest");
  const [days, setDays] = useState(7);
  const [state, setState] = useState("idle");
  const [data, setData] = useState(null);

  const run = async (which, d) => {
    if (!AIS_BACKEND_URL) { setState("error"); setData({ error: "Backend not configured." }); return; }
    setState("loading"); setData(null);
    try {
      const path = which === "digest" ? `/api/ai/digest?days=${d}` : `/api/ai/correlations?days=${d}`;
      const r = await fetch(`${AIS_BACKEND_URL}${path}`);
      setData(await r.json());
      setState("done");
    } catch {
      setData({ error: "Could not reach the analysis service." });
      setState("error");
    }
  };

  const pick = (which, d) => { setTab(which); setDays(d); run(which, d); };

  return (
    <div className="rounded" style={{ background: C.panel, border: `1px solid ${C.line}`, padding: "12px 14px" }}>
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 10 }}>
        <button onClick={() => pick("digest", days)} className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 10, color: tab === "digest" ? C.ink : C.dim,
            background: tab === "digest" ? C.amber : C.panel2, border: `1px solid ${C.line}` }}>
          <FileText size={10} /> DIGEST
        </button>
        <button onClick={() => pick("corr", days)} className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 10, color: tab === "corr" ? C.ink : C.dim,
            background: tab === "corr" ? "#C084FC" : C.panel2, border: `1px solid ${C.line}` }}>
          <GitCompare size={10} /> AIR ↔ SEA
        </button>
        <span style={{ flex: 1 }} />
        {[7, 30].map((d) => (
          <button key={d} onClick={() => pick(tab, d)} className="px-1.5 py-1 rounded font-mono"
            style={{ fontSize: 10, color: days === d ? C.ink : C.faint,
              background: days === d ? C.line : "transparent", border: `1px solid ${C.line}` }}>
            {d}d
          </button>
        ))}
      </div>

      {state === "idle" && (
        <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
          {tab === "digest"
            ? "A briefing on the watched airspaces. Each site is polled over a 250nm radius, so its figure counts aircraft across a region rather than at that base — a tighter 25nm count is shown alongside. Counts are computed from the archive; the summary is written from those counts."
            : "Where air activity and marine contacts of interest occurred near each other in time and space. Co-occurrence only — no causal link is implied or observable from public data."}
        </div>
      )}

      {state === "loading" && (
        <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>querying the archive…</div>
      )}

      {data && data.error && (
        <div className="flex items-start gap-1.5" style={{ fontSize: 11, color: C.dim }}>
          <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{data.error === "archive_unavailable"
            ? "The archive is not available on this instance, so there is nothing to summarise."
            : data.error}</span>
        </div>
      )}

      {data && !data.error && tab === "digest" && data.totals && (
        <>
          <div className="font-mono" style={{ fontSize: 10, color: C.dim, lineHeight: 1.8, marginBottom: 8 }}>
            <div style={{ color: C.amber, letterSpacing: 1 }}>COMPUTED · LAST {data.windowDays} DAYS</div>
            {data.totals.contacts} aircraft · {data.totals.uav} UAV · {data.totals.military} military · {data.totals.sites} airspaces
            {data.top && data.top.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: C.faint }}>
                  aircraft within {data.sweepRadiusNm || 250}nm of each site
                  {data.nearRadiusNm ? ` (→ within ${data.nearRadiusNm}nm)` : ""}
                </div>
                {data.top.slice(0, 5).map((s) => (
                  <div key={s.site} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.site}</span>
                    <span>{s.contacts}{s.nearContacts != null ? ` → ${s.nearContacts}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {data.coversPrevWindow === false && (
              <div style={{ marginTop: 4, color: C.amber }}>
                Archive is {data.archiveAgeHours}h old — shorter than the comparison window, so
                no week-on-week change can be shown yet.
              </div>
            )}
            {data.risers && data.risers.length > 0 && (
              <div style={{ marginTop: 4, color: "#F0553B" }}>
                {data.risers.map((r) => <div key={r.site}>▲ {r.site}: {r.prev} → {r.now}</div>)}
              </div>
            )}
          </div>
          {data.briefing && (
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
              <div className="font-mono" style={{ fontSize: 9.5, color: "#C084FC", letterSpacing: 1, marginBottom: 4,
                display: "flex", alignItems: "center", gap: 4 }}>
                <Sparkles size={10} /> AI BRIEFING
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>{data.briefing}</div>
            </div>
          )}
        </>
      )}

      {data && !data.error && tab === "corr" && (
        <>
          <div className="font-mono" style={{ fontSize: 10, color: C.dim, lineHeight: 1.8, marginBottom: 8 }}>
            <div style={{ color: "#C084FC", letterSpacing: 1 }}>COMPUTED · {data.count || 0} CO-OCCURRENCES</div>
            {(data.pairs || []).map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.site} ↔ {p.vessel}
                </span>
                <span>{p.distanceNm}nm</span>
              </div>
            ))}
            {(!data.pairs || data.pairs.length === 0) && <div style={{ color: C.faint }}>No co-occurrences in this window.</div>}
          </div>
          {data.summary && (
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
              <div className="font-mono" style={{ fontSize: 9.5, color: "#C084FC", letterSpacing: 1, marginBottom: 4,
                display: "flex", alignItems: "center", gap: 4 }}>
                <Sparkles size={10} /> AI SUMMARY
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>{data.summary}</div>
            </div>
          )}
        </>
      )}

      {data && data.disclosure && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          {data.disclosure}
        </div>
      )}
    </div>
  );
}

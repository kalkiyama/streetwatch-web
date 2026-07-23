import { useState, useEffect } from "react";
import { Sparkles, FileText, GitCompare, AlertTriangle, Copy, Check } from "lucide-react";
import { C } from "../theme.js";
import { AIS_BACKEND_URL } from "../config.js";

// Weekly digest + cross-domain correlations.
//
// Same discipline as TrackNarrative: computed figures are shown as a table the reader can
// audit, the AI prose sits below it clearly labelled, and the disclosure is permanent rather
// than a tooltip. Both views are on-demand — nothing here runs on a schedule or per contact.
export default function AiBriefing({ days = 7 }) {
  // `days` comes from the archive view's own 1/7/30/90 selector — previously this component
  // kept a private 7/30 pair, so the user's selection above it was silently ignored and the
  // analysis always covered 7 days regardless.
  const [tab, setTab] = useState("digest");
  const [state, setState] = useState("idle");
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  const run = async (which, d) => {
    if (!AIS_BACKEND_URL) { setState("error"); setData({ error: "Backend not configured." }); return; }
    setState("loading"); setData(null);
    try {
      const path = which === "digest" ? `/api/ai/digest?days=${d}` : `/api/ai/correlations?days=${d}`;
      const r = await fetch(`${AIS_BACKEND_URL}${path}`);
      const j = await r.json();
      if (r.status === 429) {
        setData({ error: j.note || "Too many analyses in a short time — please wait a few minutes." });
        setState("error");
        return;
      }
      setData(j);
      setState("done");
    } catch {
      setData({ error: "Could not reach the analysis service." });
      setState("error");
    }
  };

  const pick = (which) => { setTab(which); setState("idle"); setData(null); };

  // If the user changes the look-back after generating, regenerate for the new window —
  // otherwise the panel would silently show analysis for a window they no longer have selected.
  useEffect(() => { if (state === "done") run(tab, days);}, [days]);

  return (
    <div className="rounded" style={{ background: C.panel, border: `1px solid ${C.line}`, padding: "12px 14px" }}>
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 10 }}>
        <button onClick={() => pick("digest")} title="A written summary of activity across the watched airspaces" className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 10, color: tab === "digest" ? C.ink : C.dim,
            background: tab === "digest" ? C.amber : C.panel2, border: `1px solid ${C.line}` }}>
          <FileText size={10} /> DIGEST
        </button>
        <button onClick={() => pick("corr")} title="Aircraft and vessels of interest recorded near each other in time and space" className="flex items-center gap-1 px-2 py-1 rounded font-mono"
          style={{ fontSize: 10, color: tab === "corr" ? C.ink : C.dim,
            background: tab === "corr" ? "#C084FC" : C.panel2, border: `1px solid ${C.line}` }}>
          <GitCompare size={10} /> AIR ↔ SEA
        </button>
        <span style={{ flex: 1 }} />
        <span className="font-mono" style={{ fontSize: 9, color: C.faint }}>window: {days}d (set above)</span>
      </div>

      <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginBottom: 8, lineHeight: 1.5 }}>
        {tab === "digest"
          ? "DIGEST — what changed across the watched airspaces, computed from the archive."
          : "AIR ↔ SEA — where aircraft and vessels of interest were recorded near each other. Proximity only; no causal link is implied."}
      </div>

      {state === "idle" && (
        <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
          <button onClick={() => run(tab, days)} className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono mb-2"
            style={{ fontSize: 11, color: "#0A0D12", background: "#C084FC", border: "none", fontWeight: 700 }}>
            <Sparkles size={12} /> GENERATE {tab === "digest" ? "DIGEST" : "AIR ↔ SEA ANALYSIS"} · LAST {days} {days === 1 ? "DAY" : "DAYS"}
          </button>
          {tab === "digest"
            ? "A briefing on the watched airspaces, grouped by country. Each site is polled over a 250nm radius, so that figure counts a whole region — a 25nm local count and a field-level count (within 10nm, below 4,000ft) are shown alongside, and bases are ranked by the field-level figure. All counts are computed from the archive; the summary only writes them up."
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

      {data && !data.error && data.note && !data.briefing && !data.summary && (
        <div className="flex items-start gap-1.5 mb-2" style={{ fontSize: 11, color: C.amber }}>
          <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{data.note}</span>
        </div>
      )}

      {data && !data.error && tab === "digest" && data.countries && data.countries.length > 0 && (
        <div className="font-mono" style={{ fontSize: 10.5, color: C.dim, marginBottom: 8, lineHeight: 1.6 }}>
          <div style={{ color: C.faint, fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>BY COUNTRY</div>
          {data.countries.slice(0, 6).map((c) => (
            <div key={c.country}>
              {c.country}: <b style={{ color: C.text }}>{c.contacts}</b> aircraft · {c.sites} airspaces
              {c.terminal > 0 ? ` · ${c.terminal} at a field` : ""}
            </div>
          ))}
        </div>
      )}

      {data && !data.error && tab === "digest" && data.topField && data.topField.length > 0 && (
        <div className="font-mono" style={{ fontSize: 10.5, color: C.dim, marginBottom: 8, lineHeight: 1.6 }}>
          <div style={{ color: C.faint, fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
            BUSIEST AT THE FIELD (&le;10nm, &lt;4,000ft)
          </div>
          {data.topField.slice(0, 5).map((r) => (
            <div key={r.site}>
              {r.site}: <b style={{ color: C.text }}>{r.terminal}</b> at the field
              <span style={{ opacity: 0.6 }}> · {r.contacts} in the surrounding 250nm</span>
            </div>
          ))}
        </div>
      )}

      {data && !data.error && tab === "digest" && data.totals && (
        <>
          <div className="font-mono" style={{ fontSize: 10, color: C.dim, lineHeight: 1.8, marginBottom: 8 }}>
            <div style={{ color: C.amber, letterSpacing: 1 }}>
              COMPUTED · LAST {data.windowDays} {data.windowDays === 1 ? "DAY" : "DAYS"}
              {data.archiveAgeHours != null && data.archiveAgeHours < data.windowDays * 24
                ? ` (archive spans ${data.archiveAgeHours}h)` : ""}
            </div>
            {data.totals.contacts} aircraft · {data.totals.uav} UAV · {data.totals.military} military · {data.totals.sites} airspaces
            {data.top && data.top.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: C.faint }}>
                  busiest airfields — within {data.nearRadiusNm || 25}nm (→ within {data.sweepRadiusNm || 250}nm)
                </div>
                {((data.topNear && data.topNear.length ? data.topNear : data.top) || []).slice(0, 5).map((s) => (
                  <div key={s.site} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.site}</span>
                    <span>
                      <b style={{ color: C.text }}>{s.nearContacts != null ? s.nearContacts : "—"}</b>
                      <span style={{ color: C.faint }}> of {s.contacts}</span>
                    </span>
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

      {data && !data.error && (data.briefing || data.summary) && (
        <button onClick={() => {
            const lines = [];
            lines.push(`StreetWatch — ${tab === "digest" ? "activity digest" : "air-sea co-occurrence analysis"} · last ${data.windowDays || days} day${(data.windowDays || days) === 1 ? "" : "s"}`);
            if (tab === "digest" && data.totals) lines.push(`${data.totals.contacts} aircraft · ${data.totals.uav} UAV · ${data.totals.military} military · ${data.totals.sites} airspaces`);
            ((data.topNear && data.topNear.length ? data.topNear : data.top) || []).slice(0, 5)
              .forEach((x) => lines.push(`  ${x.site}: ${x.nearContacts != null ? x.nearContacts + " within 25nm of " : ""}${x.contacts} within 250nm`));
            (data.pairs || []).forEach((x) => lines.push(`  ${x.site} <-> ${x.vessel}: ${x.distanceNm}nm`));
            if (data.briefing) lines.push("", data.briefing);
            if (data.summary) lines.push("", data.summary);
            if (data.disclosure) lines.push("", data.disclosure);
            const txt = lines.join("\n");
            try { navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }
            catch { /* clipboard unavailable */ }
          }}
          className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded font-mono"
          style={{ fontSize: 10, color: copied ? "#37C46A" : C.dim, background: C.panel2, border: `1px solid ${C.line}` }}>
          {copied ? <><Check size={11} /> COPIED</> : <><Copy size={11} /> COPY AS TEXT</>}
        </button>
      )}

      {data && data.disclosure && (
        <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          {data.disclosure}
        </div>
      )}
    </div>
  );
}

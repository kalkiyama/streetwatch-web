import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Download } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Every watched site, not the eight the briefing mentions.
//
// The briefing is a summary and should stay one — nobody reads 394 sites of prose. But the
// consequence was that 98% of what the archive knows never reached the app in any form: Taiwan
// Strait with one contact, Yaoundé with one, Yerevan appearing for the first time. All recorded,
// none visible anywhere.
//
// COLLAPSED BY DEFAULT. 394 rows shown unconditionally is the wall of text this app has spent a
// lot of effort removing everywhere else.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = [
  { k: "site", label: "Site", align: "left", always: true },
  { k: "country", label: "Country", align: "left" },
  { k: "contacts", label: "Contacts", align: "right", always: true },
  { k: "uav", label: "UAV", align: "right" },
  { k: "terminal", label: "At field", align: "right" },
  { k: "changePct", label: "Change", align: "right", always: true },
];

export default function SitesTable({ days = 7 }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle");
  const [sort, setSort] = useState({ k: "contacts", dir: -1 });
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("All");

  // Fetched only when opened. A 394-site aggregate over 423,000 archive rows is not something to
  // run on every page load for a panel most visitors will never expand.
  useEffect(() => {
    if (!open || data || state === "loading") return;
    setState("loading");
    fetch(`${BACKEND_URL}/api/drones/sites-activity?days=${days}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { setData(j); setState("ok"); })
      .catch(() => setState("error"));
  }, [open, data, state, days]);

  const sites = (data && data.sites) || [];

  const countries = useMemo(() => {
    const c = {};
    sites.forEach((s) => { if (s.country) c[s.country] = (c[s.country] || 0) + 1; });
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sites]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = sites.filter((s) => {
      if (country !== "All" && s.country !== country) return false;
      if (needle && !`${s.site} ${s.country || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return out.sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      // Nulls sort LAST whichever direction is chosen. A site with no comparison is not the
      // smallest change, it is an absent one, and floating those to the top of a "biggest rise"
      // sort would be the table lying about what it knows.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * sort.dir;
      return (va - vb) * sort.dir;
    });
  }, [sites, q, country, sort]);

  const csv = () => {
    const head = ["site", "country", "contacts", "uav", "military", "terminal", "prev", "changePct"];
    const rows = shown.map((s) => head.map((h) => {
      const v = s[h];
      if (v == null) return "";
      // Quote anything containing a comma — site names like "RAF Lakenheath / Mildenhall" are fine
      // but a comma would silently shift every column after it.
      return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
    }).join(","));
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `streetwatch-sites-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const th = (col) => (
    <th key={col.k}
      className={col.always ? "" : "hidden sm:table-cell"}
      style={{ textAlign: col.align, padding: "4px 6px", fontWeight: 500, color: C.faint,
        cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}
      onClick={() => setSort((s) => ({ k: col.k, dir: s.k === col.k ? -s.dir : -1 }))}>
      {col.label}
      {sort.k === col.k && <span style={{ color: C.cyan }}> {sort.dir < 0 ? "▼" : "▲"}</span>}
    </th>
  );

  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 8 }}>
      <button onClick={() => setOpen((v) => !v)} className="rounded font-mono w-full"
        style={{ fontSize: 10.5, padding: "5px 10px", color: C.cyan,
          background: "rgba(34,211,238,0.08)", border: `1px solid ${C.cyan}44` }}>
        {open ? "Hide the full list" : `Every watched site${data ? ` (${data.total})` : ""} — sort, filter, export`}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {state === "loading" && (
            <div className="font-mono" style={{ fontSize: 10, color: C.faint, padding: "10px 0" }}>
              reading the archive…
            </div>
          )}
          {state === "error" && (
            <div className="font-mono" style={{ fontSize: 10, color: C.amber, padding: "10px 0" }}>
              the archive is not answering right now
            </div>
          )}

          {state === "ok" && (
            <>
              <div className="flex items-center gap-1.5 flex-wrap font-mono" style={{ marginBottom: 6 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="site or country"
                  className="px-2 rounded font-mono"
                  style={{ fontSize: 10, height: 24, width: 150, color: C.dim, background: C.ink,
                    border: `1px solid ${C.line}` }} />
                <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className="px-1.5 rounded font-mono"
                  style={{ fontSize: 10, height: 24, color: C.dim, background: C.ink, border: `1px solid ${C.line}` }}>
                  <option value="All" style={{ background: C.panel }}>All countries</option>
                  {countries.map(([cn, n]) => (
                    <option key={cn} value={cn} style={{ background: C.panel }}>{cn} ({n})</option>
                  ))}
                </select>
                <span style={{ flex: 1 }} />
                <button onClick={csv} className="flex items-center gap-1 rounded font-mono"
                  style={{ fontSize: 10, padding: "3px 8px", color: C.dim, background: C.panel2,
                    border: `1px solid ${C.line}` }}>
                  <Download size={10} /> CSV
                </button>
              </div>

              <div style={{ maxHeight: 420, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 6 }}>
                <table className="w-full font-mono" style={{ fontSize: 10.5, borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: C.panel2, zIndex: 1 }}>
                    <tr style={{ borderBottom: `1px solid ${C.line}` }}>{COLS.map(th)}</tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.site} style={{ borderBottom: `1px solid ${C.line}44` }}>
                        <td style={{ padding: "4px 6px", color: C.text }}>{s.site}</td>
                        <td className="hidden sm:table-cell" style={{ padding: "4px 6px", color: C.dim }}>{s.country || "—"}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: C.text }}>{s.contacts}</td>
                        <td className="hidden sm:table-cell" style={{ padding: "4px 6px", textAlign: "right", color: s.uav ? "#C084FC" : C.faint }}>{s.uav || "—"}</td>
                        <td className="hidden sm:table-cell" style={{ padding: "4px 6px", textAlign: "right", color: C.dim }}>{s.terminal || "—"}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right",
                          color: s.changePct == null ? C.faint : s.changePct > 0 ? C.amber : s.changePct < 0 ? "#5AC8FA" : C.dim }}>
                          {/* An em dash, not a zero. No comparison and no change are different
                              facts, and a table that prints 0 for both has flattened one into
                              the other. */}
                          {s.changePct == null ? "—" : `${s.changePct > 0 ? "+" : ""}${s.changePct}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="font-mono" style={{ fontSize: 9, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                {shown.length.toLocaleString()} of {sites.length.toLocaleString()} sites ·
                {" "}counts are distinct aircraft seen within the sweep radius over {days} days ·
                {" "}<b>At field</b> is those below 4,000ft within 10nm, which is use of the field
                rather than passage overhead. Change compares the previous {days} days and is shown
                as <b>—</b> where the archive does not reach back far enough, or where the earlier
                window was too small for a percentage to mean anything.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

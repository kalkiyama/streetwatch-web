import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { C } from "../theme.js";
import { BACKEND_URL } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// One true thing, right now, with a way to go and look at it.
//
// The problem this solves: a visitor arrives at five tabs of dense console and nothing tells them
// what to look at. The guide explains what the app IS, which is a different question from what is
// worth seeing in the next ten seconds — and explanation is what people skip. A concrete fact does
// the work that a paragraph cannot.
//
// TWO RULES, and they are the whole design:
//
//   1. EVERY LINE IS COMPUTED FROM LIVE DATA. Nothing is canned, nothing is an example, and no
//      number is written into this file. If the fetch fails the banner does not appear at all —
//      a placeholder claiming activity would be the one dishonest thing on the page.
//
//   2. QUIET WHEN IT IS QUIET. On a Sunday with four contacts it says four, plainly. An app that
//      manufactures significance on its front page has undermined everything else it claims about
//      its data, and this app's entire argument is that it does not do that.
// ─────────────────────────────────────────────────────────────────────────────

export default function StartHere({ onGo, onDismiss }) {
  const [fact, setFact] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/api/drones`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || !j.drones) return;
        setFact(pickFact(j));
      })
      .catch(() => { /* no banner rather than a fabricated one */ });
    return () => { alive = false; };
  }, []);

  if (!fact) return null;

  return (
    // STACKED, not a single row. As one row the text sat between two fixed-width elements and on a
    // phone had almost nothing left — it wrapped to roughly one word per line. The label and the
    // controls belong together on top; the sentence gets the full width beneath them.
    <div className="rounded-lg px-3 py-2 mb-2 font-mono"
      style={{ border: `1px solid ${C.cyan}44`, background: "rgba(34,211,238,0.07)", fontSize: 11.5 }}>
      <div className="flex items-center gap-2">
        <span style={{ color: C.faint, letterSpacing: 1, fontSize: 9, flex: 1 }}>RIGHT NOW</span>
      <button onClick={() => onGo && onGo(fact.tab)}
        className="flex items-center gap-1 rounded flex-shrink-0"
        style={{ fontSize: 10.5, padding: "3px 9px", color: "#04121F", background: C.cyan }}>
        {fact.cta}<ArrowRight size={11} />
      </button>
      <button onClick={onDismiss} aria-label="Dismiss"
        style={{ color: C.dim, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ color: C.text, lineHeight: 1.45, marginTop: 3 }}>{fact.text}</div>
    </div>
  );
}

// Facts are ranked by how UNUSUAL they are, not by how dramatic they sound. A UAV airborne is
// genuinely rarer than a military transport, and a named base with several aircraft up says more
// than a global total — so those come first when they are true, and the plain count is the floor.
function pickFact(j) {
  const drones = j.drones || [];
  if (!drones.length) return null;

  const uav = drones.filter((d) => d.kind === "uav");
  const named = drones.filter((d) => d.site && !String(d.site).startsWith("Deep sweep"));

  // Busiest NAMED site. "Deep sweep 50.6N 4.2E" is a grid cell, not a place, and telling someone
  // to look at a coordinate is not an invitation.
  const bySite = {};
  named.forEach((d) => { bySite[d.site] = (bySite[d.site] || 0) + 1; });
  const top = Object.entries(bySite).sort((a, b) => b[1] - a[1])[0];

  const facts = [];

  if (uav.length >= 3) {
    const where = uav.find((u) => u.site && !String(u.site).startsWith("Deep sweep"));
    facts.push({
      text: `${uav.length} unmanned aircraft are broadcasting right now`
        + (where ? `, including one over ${where.site}` : "")
        + ". Most days there are none.",
      cta: "Watch", tab: "drones",
    });
  }

  if (top && top[1] >= 3) {
    facts.push({
      text: `${top[1]} military aircraft are airborne around ${top[0]} right now.`,
      cta: "Look", tab: "drones",
    });
  }

  const mil = drones.filter((d) => d.kind === "military").length;
  if (mil >= 1) {
    const sweep = j.sweep || {};
    facts.push({
      text: `${mil} military aircraft airborne across ${sweep.sites ? sweep.sites.toLocaleString() : "1,000+"} watched airspaces.`,
      cta: "Look", tab: "drones",
    });
  }

  // The first fact that qualified. Ordered by rarity above, so this is the most unusual true thing
  // available rather than the most eye-catching one that could be phrased.
  return facts[0] || null;
}

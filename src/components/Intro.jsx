import { X, Globe, Plane, Ship, Layers, Camera, Share2, Hand, Sparkles } from "lucide-react";
import { C } from "../theme.js";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "../config.js";

// First-visit welcome + permanent guide (the "?" in the header).
//
// The app explains its DATA honestly everywhere, but until now never explained ITSELF —
// a new visitor landed on a dense console with zero orientation. Same rules as the rest
// of the app: say what it is, say where things are, say what it cannot see.
const S = ({ icon: Icon, color, title, children }) => (
  <div className="flex gap-3" style={{ marginBottom: 14 }}>
    <div className="flex-shrink-0 flex items-center justify-center rounded"
      style={{ width: 30, height: 30, background: `${color}1c`, border: `1px solid ${color}55` }}>
      <Icon size={15} color={color} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>{children}</div>
    </div>
  </div>
);

export default function Intro({ open, onClose, feedCount = null }) {
  // Coverage figures are FETCHED, never typed. Hardcoding them meant the welcome screen quietly
  // described an older, smaller product every time coverage grew. If the fetch fails we fall back
  // to durable language ("1,000+") rather than a specific number that might now be wrong.
  const [cov, setCov] = useState(null);
  useEffect(() => {
    if (!open || cov) return;
    let alive = true;
    fetch(`${BACKEND_URL}/api/drones`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j && j.sweep) setCov(j.sweep); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, cov]);

  // cov.sites already CONTAINS the deep-grid cells, so never add deepCells to it.
  const airspaces = cov && cov.sites ? cov.sites : null;
  const named = cov && cov.namedSites ? cov.namedSites : null;
  const countries = cov && cov.countries ? cov.countries : null;
  const airspaceText = airspaces ? airspaces.toLocaleString() : "1,000+";
  const namedText = named ? named.toLocaleString() : "300+";
  const countryText = countries ? `${countries} countries` : "170+ countries";
  const feedText = feedCount ? feedCount.toLocaleString() : "7,000+";

  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 2000, background: "rgba(5,8,12,0.78)", backdropFilter: "blur(3px)" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="rounded-lg overflow-y-auto"
        style={{ maxWidth: 520, width: "100%", maxHeight: "88vh",
          background: C.panel, border: `1px solid ${C.line}`, padding: "20px 20px 14px" }}>

        <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.3 }}>
              Welcome to <span style={{ color: C.amber }}>StreetWatch</span>
            </div>
            <div className="font-mono" style={{ fontSize: 11, color: C.faint, marginTop: 3, lineHeight: 1.5 }}>
              One console for the living planet — {feedText} public live feeds:
              flights, ships, weather satellites, webcams, wildlife and space,
              plus a military &amp; drone watch nobody else runs.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close guide"
            className="flex-shrink-0 flex items-center justify-center rounded"
            style={{ width: 28, height: 28, color: C.dim, background: C.panel2, border: `1px solid ${C.line}` }}>
            <X size={14} />
          </button>
        </div>

        <S icon={Globe} color={C.cyan} title="World — find anything">
          Search {feedText} feeds (typos are fine), or tap <b>MAP</b> to browse the whole planet
          visually. Tap a cluster to zoom in; tap a dot to open it. Cyan dots are airports,
          blue rings are ports. Every filter — layer, region, search — updates the map live.
        </S>

        <S icon={Layers} color="#C084FC" title="Map layers — compose your view">
          On the map, switch on <b style={{ color: "#C084FC" }}>LIVE DRONES</b> (military &amp; UAV
          contacts right now), <b style={{ color: "#F6A821" }}>ACTIVITY</b> (where they concentrate
          over 1–90 days), <b style={{ color: "#2DD4BF" }}>SEA DRONES</b> and{" "}
          <b style={{ color: "#F0553B" }}>SUB SUPPORT</b> (surface ships around submarine
          operations). Layers stack. Tap any contact to open its radar with it selected.
        </S>

        <S icon={Plane} color={C.amber} title="Drones — the watch">
          A sweep patrols <b>{airspaceText} airspaces</b> around the clock — {namedText} named military airfields across {countryText}, plus a global grid that finds activity nobody thought to watch{cov && cov.gridPromoted ? ` (${cov.gridPromoted} grid cells have already been promoted for producing contacts)` : ""}. It keeps a
          <b> 90-day public archive</b>, and lets you replay any contact&rsquo;s recorded track on a
          map. Radars filter to <b>MIL / UAV</b> and flip between radar and real-geography views.
        </S>

        <S icon={Ship} color="#2563EB" title="Marine — live ships">
          Live vessels from state-run open AIS feeds (Baltic + Norway &amp; Svalbard; global joins
          automatically when its provider is healthy). Filter any port radar to sea drones or
          submarine-support vessels.
        </S>

        <S icon={Camera} color="#37C46A" title="Cameras & more">
          Every feed offers <b>NEARBY CAMS</b> — public webcams within 31 miles. Weather satellites,
          wildlife cams, city views and the ISS live in their own layers.
        </S>

        <S icon={Sparkles} color="#C084FC" title="AI-assisted analysis">
          Ask in plain English (&ldquo;drone activity near the Black Sea last week&rdquo;), get any
          archived track explained (&ldquo;a 3.8-lap racetrack at 22,000ft, consistent with
          surveillance&rdquo;), and read a briefing on what changed across the watched airspaces.
          Everything is <b>computed first</b> — the AI only writes the English, the measured
          numbers are always shown beside it, and every AI output is labelled.
        </S>

        <S icon={Layers} color="#F0553B" title="Reading the maps">
          <b>AT FIELD</b> ranks bases by aircraft seen within 10nm below 4,000ft — activity at the
          runway itself, not the surrounding airspace. Those are very different numbers, and the
          gap between them is usually the interesting part. <b>ADVISORIES</b> shows official
          conflict-zone bulletins; they advise <i>civil</i> operators and never bind military
          flights, so military traffic can legitimately appear inside airspace airlines avoid.
        </S>

        <S icon={Share2} color={C.dim} title="Share exactly what you see">
          Every radar view has a share link that reopens at the same feed, range and selected
          aircraft — evidence you can hand to someone.
        </S>

        <S icon={Hand} color={C.faint} title="On a phone">
          One finger scrolls the page; <b>two fingers pan any map</b>.
        </S>

        <div className="rounded" style={{ background: C.panel2, border: `1px solid ${C.line}`,
          padding: "10px 12px", marginBottom: 12 }}>
          <div className="font-mono" style={{ fontSize: 10, color: C.amber, letterSpacing: 1, marginBottom: 4 }}>
            WHAT THIS APP WILL NOT PRETEND
          </div>
          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
            Everything here is <b>public data</b>, and public data has edges: aircraft flying with
            transponders off are invisible, submarines cannot be tracked by anyone (radio does not
            travel through seawater), and AIS coverage varies by region. AI never invents a data
            point — analysis is computed from the archive first, and the AI&rsquo;s words are
            labelled and shown next to the numbers they describe. Where StreetWatch cannot
            see, it says so — on the display, in the data, every time. Public feeds only. No
            private cameras, ever. Visits are counted anonymously and cookie-free (no
            advertising trackers, nothing follows you across the web).
          </div>
        </div>

        <button onClick={onClose} className="w-full rounded font-mono"
          style={{ padding: "10px 0", fontSize: 12, letterSpacing: 1, color: C.ink,
            background: C.amber, border: "none", fontWeight: 700 }}>
          START WATCHING
        </button>
        <div className="font-mono" style={{ fontSize: 9.5, color: C.faint, textAlign: "center", marginTop: 8 }}>
          reopen this guide any time with the ? in the header
        </div>
      </div>
    </div>
  );
}

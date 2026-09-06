import { X, Globe, Plane, Share2, Sparkles, Satellite, Shield, Server } from "lucide-react";
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
  // THREE sections open, four behind a toggle. Seven at once was around 400 words aimed at a
  // first-time visitor — the person least invested in reading any of it, and most likely to close
  // the box rather than work through it. Drones is the thing nobody else does; Space and Data are
  // the two that look like something the moment they load. Those three earn the space.
  const [more, setMore] = useState(false);
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

        {/* ORGANISED BY TAB, because that is what a visitor sees. The previous version was
            arranged by feature — World, Layers, Marine, Cameras — and had never been updated as
            the app grew: Space, Cyber and Data were not mentioned once, so three of five tabs were
            invisible to anyone reading the guide. The app explains its data scrupulously and had
            drifted back into not explaining ITSELF.

            Each line says what is BEHIND the tab, not what category it belongs to. "Orbital
            tracking" is a label; "16,000 satellites on a globe lit by the real sun" is a reason to
            press it. */}

        <S icon={Plane} color={C.amber} title="Military — the watch nobody else runs">
          A sweep patrols <b>{airspaceText} airspaces</b> around the clock — {namedText} named
          military airfields across {countryText}, plus a global grid that finds activity nobody
          thought to watch{cov && cov.gridPromoted ? ` (${cov.gridPromoted} grid cells have already been promoted for producing contacts)` : ""}.
          Contacts are filterable to <b>MIL / UAV</b>, every track can be replayed from the{" "}
          <b>90-day archive</b>, and <b>AT FIELD</b> ranks bases by aircraft seen within 10nm below
          4,000ft — activity at the runway itself rather than the airspace around it. Those are very
          different numbers, and the gap between them is usually the interesting part.
        </S>

        {!more && (
          <button onClick={() => setMore(true)} className="rounded font-mono w-full"
            style={{ fontSize: 11, padding: "7px 10px", marginBottom: 14, color: C.cyan,
              background: "rgba(34,211,238,0.08)", border: `1px solid ${C.cyan}44` }}>
            Also here: every other live feed, cyber attack flows, AI analysis, sharing
          </button>
        )}
        {more && (<>
        <S icon={Globe} color={C.cyan} title="World — everything else that moves">
          {feedText} public feeds: airports, ports, weather satellites, webcams, wildlife.
          Search it (typos are fine) or browse the map. Switch on live aircraft, ships, sea drones
          and submarine-support vessels; layers stack. Tap any contact to open its radar with that
          aircraft or ship already selected.
        </S>

        <S icon={Satellite} color="#A78BFA" title="Space — 16,000 satellites, right now">
          A globe lit by the real sun, with city lights on the night side and every active satellite
          computed for this moment from published orbital elements. Toggle Starlink, GPS, weather,
          Earth imaging or the whole catalogue. Speed time up to watch a day pass in minutes. The
          ISS is tracked live and modelled separately, because its position is <i>observed</i> while
          the rest are <i>computed</i>.
        </S>

        <S icon={Server} color="#22D3EE" title="Data — where the internet physically is">
          5,258 data centres in 148 countries, on satellite imagery detailed enough to see the
          cooling plant on the roof. Each one says when that imagery was taken. Capacity, water use
          and power sourcing are shown as <b>unknown</b> where nobody publishes them, which is
          most of the time — this map does not guess.
        </S>

        <S icon={Shield} color="#F0553B" title="Cyber — attacks and outages">
          Where internet attack traffic is coming from and going to, on a globe, with arcs that lift
          higher the further the traffic travels. Plus national outages and the vulnerabilities
          currently being exploited in the wild. Measured by Cloudflare — filtered requests over 24
          hours, not intrusions, and not attributed to anyone.
        </S>

        <S icon={Sparkles} color="#C084FC" title="AI-assisted analysis">
          Ask in plain English (&ldquo;drone activity near the Black Sea last week&rdquo;), get any
          archived track explained (&ldquo;a 3.8-lap racetrack at 22,000ft, consistent with
          surveillance&rdquo;), and read a briefing on what changed across the watched airspaces.
          Everything is <b>computed first</b> — the AI only writes the English, the measured
          numbers are always shown beside it, and every AI output is labelled.
        </S>

        <S icon={Share2} color={C.dim} title="Share exactly what you see">
          Every radar view has a share link that reopens at the same feed, range and selected
          aircraft — evidence you can hand to someone. On a phone, one finger scrolls the page
          and <b>two fingers pan any map</b>.
        </S>
        </>)}


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

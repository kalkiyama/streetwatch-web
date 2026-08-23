// StreetWatch — main shell. Views live in ./components, data in catalog.json.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, MapPin, X, Globe, ExternalLink, SignalHigh, Star, Navigation, Plane, Share2, HelpCircle, Sparkles, Shield, Satellite, Flag } from "lucide-react";
import Intro from "./components/Intro.jsx";
// Catalog is fetched at runtime from /catalog.json (5,000+ feeds — too big to bundle).
import { C, LAYERS, layerKeys, DRONE_LAYERS, resolveUrl, openLive, fmtDate, setUtc, isUtc } from "./theme.js";
import { distKm } from "./geo.js";
import { AIS_BACKEND_URL, BACKEND_URL } from "./config.js";
import MapPanel from "./components/MapPanel.jsx";
import NearbyCams from "./components/NearbyCams.jsx";
import { useClock, LiveViewport, DataPreview } from "./components/FeedViewer.jsx";
import AviationRadar from "./components/AviationRadar.jsx";
import { norm, fuzzyHit, budgetFor, words } from "./search.js";
import MarineRadar from "./components/MarineRadar.jsx";
import EarthView from "./components/EarthView.jsx";
import SpaceView from "./components/SpaceView.jsx";
import DroneSweep from "./components/DroneSweep.jsx";
import CyberView from "./components/CyberView.jsx";

const timeAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}min ago`;
  return `${Math.round(m / 60)}h ago`;
};

export default function StreetWatch() {
  const now = useClock();
  // Default landing is the DRONE WATCH — the differentiator — rather than the generic world
  // browser. Deep links (?feed=...) below still route to whichever tab their feed lives in.
  const [tab, setTab] = useState("drones");
  const [CATALOG, setCatalog] = useState([]);
  const [catalogErr, setCatalogErr] = useState(false);
  useEffect(() => {
    fetch("/catalog.json").then((r) => { if (!r.ok) throw 0; return r.json(); })
      .then(setCatalog).catch(() => setCatalogErr(true));
  }, []);
  const deepLinked = React.useRef(false);
  // CAPTURED ONCE, AT MOUNT. Line ~176 WRITES ?feed= into the URL as you browse, so reading
  // window.location on every CATALOG change reads back what the app itself just wrote — and since
  // CATALOG now arrives in two stages, the second pass found a feed that was never shared with
  // anyone and routed the tab to match it. The app opened on Drones and switched to World on its
  // own, before the welcome screen had even appeared.
  const urlFeed = React.useRef(typeof window === "undefined" ? null
    : new URLSearchParams(window.location.search).get("feed"));
  useEffect(() => {
    if (deepLinked.current || !CATALOG.length || typeof window === "undefined") return;
    const want = urlFeed.current;
    // THE GUARD BURNS ON A SUCCESSFUL MATCH, NOT ON THE FIRST ATTEMPT. CATALOG now arrives in TWO
    // stages — 7,208 rows from catalog.json, then the 308 watched sites merged in from
    // /api/drones/sites. This effect used to set deepLinked.current = true before looking, so the
    // first pass missed every UAV id and the second pass never ran. Every UAV share link opened on
    // the default feed instead. Introduced by today's sites change.
    // If the id is absent from BOTH stages the guard is never set and the effect simply re-runs on
    // the next CATALOG change, which is what should happen.
    if (want && CATALOG.some((c) => c.id === want)) {
      deepLinked.current = true;
      setSelectedId(want);
      const f = CATALOG.find((c) => c.id === want);
      // route to the tab this feed belongs to — a shared webcam link must not strand the
      // recipient on the drone view, and a shared UAV link must not strand them on world
      setTab(f && f.tag === "uav" ? "drones" : "world");
    }
  }, [CATALOG]);
  // THE WATCHED AIRFIELDS COME FROM THE SWEEP, NOT FROM catalog.json. The catalog carried 240
  // hand-maintained "uav" rows against the sweep's 308 — 68 airfields watched and unlisted, so a
  // reader searching for Whiting Field or Keesler concluded they were not covered. They were.
  // Every site added since the catalog was last edited by hand went into drone-sweep.js and
  // nowhere else. A fact stated in two places diverges; this one diverged by 68 entries.
  // Fetched at runtime so it CANNOT drift again: adding a site to SITES is the whole operation.
  // THE TRADE: if the proxy is unreachable these are absent rather than stale. The sweep data they
  // describe is already backend-dependent, so a list that outlived its backend would be naming
  // airfields nobody is currently watching.
  const [, setSweepSites] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/api/drones/sites`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || !Array.isArray(j.sites)) return;
        setSweepSites(j.sites);
        // MERGED INTO CATALOG, so every existing consumer — search, filters, the map, deep links,
        // the region grouping — works on them without knowing they came from a different source.
        // Replaces rather than appends on a refetch: filter out any uav rows first, so this stays
        // idempotent if it ever runs twice.
        setCatalog((c) => [...c.filter((x) => x.tag !== "uav"), ...j.sites]);
      })
      .catch(() => { /* the rest of the catalog still works */ });
    return () => { alive = false; };
  }, []);

  const [query, setQuery] = useState("");
  // ONE CONCEPT, NOT A CONDITION PER ELEMENT. Cyber renders three public sources directly and has
  // no feed catalog behind it, so the search box, region filters, layer chips, LIST/MAP toggle and
  // the "0 FEEDS · 0 REGIONS" counters are not merely irrelevant — they IMPLY A LIST THAT IS NOT
  // THERE, and "0 feeds" reads as a broken search rather than a different kind of page.
  // The root was line ~301: `tab === "drones" ? uav : not-uav` has no third case, so Cyber fell
  // through to the World branch and inherited the whole browser.
  const browsesFeeds = tab !== "cyber" && tab !== "space";
  // Only the layers this tab can actually show. See DRONE_LAYERS in theme.js.
  const tabLayers = tab === "drones" ? DRONE_LAYERS : layerKeys;

  // The timezone setting lives in theme.js as a MODULE variable, because one of its call sites is
  // inside WorldMap's Leaflet popup builder — that runs outside React's tree and a prop cannot
  // reach it. A module variable is invisible to React, so this counter exists only to force a
  // re-render when the toggle flips.
  const [, bumpTz] = useState(0);
  const [active, setActive] = useState([...layerKeys]);
  const [continent, setContinent] = useState("All");
  const [country, setCountry] = useState("All");
  const [selectedId, setSelectedId] = useState("T-LDN-01");
  const [favorites, setFavorites] = useState([]);
  const [favOnly, setFavOnly] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [nearMe, setNearMe] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const viewerRef = React.useRef(null);
  const firstRender = React.useRef(true);
  const [geoErr, setGeoErr] = useState(null);

  const [viewRadius, setViewRadius] = useState(null);
  const [viewSel, setViewSel] = useState(null);
  const [pendingSel, setPendingSel] = useState(null);
  // A watched site with no catalog feed, synthesised in openSighting. Held in state because
  // `selected` resolves selectedId back through CATALOG, so a synthetic id would otherwise fall
  // through to results[0] and open the wrong place — a tap that does the WRONG thing rather than
  // nothing, which is worse. Same shape as the ME-AV / ME-MR cases below.
  const [siteFeed, setSiteFeed] = useState(null);
  const [pendingSelInfo, setPendingSelInfo] = useState(null);
  // Natural-language search: Claude turns the sentence into a FILTER, which is shown back to
  // the user and executed by existing code. The model never sees or returns feed data.
  const [aiQuery, setAiQuery] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const askAi = useCallback(async (text) => {
    if (!text || !AIS_BACKEND_URL) return;
    setAiBusy(true);
    try {
      const r = await fetch(`${AIS_BACKEND_URL}/api/ai/search?q=${encodeURIComponent(text)}`);
      const j = await r.json();
      if (j && j.filter) {
        const f = j.filter;
        if (f.layer && layerKeys.includes(f.layer)) setActive([f.layer]);
        if (f.continent) setContinent(f.continent);
        setQuery(f.text || "");
        if (f.intent === "drones" || f.intent === "activity") setTab("drones");
        setAiQuery({ filter: f });
      } else {
        setAiQuery({ error: (j && j.error) || "could not interpret that" });
      }
    } catch {
      setAiQuery({ error: "analysis service unreachable" });
    } finally { setAiBusy(false); }
  }, []);
  const [introOpen, setIntroOpen] = useState(() => {
    try { return !localStorage.getItem("sw-intro-seen"); } catch { return false; }
  });
  const closeIntro = () => { setIntroOpen(false); try { localStorage.setItem("sw-intro-seen", "1"); } catch { /* private mode */ } };
  // First-run coach mark pointing at the World/Drones switch. Shows once, after the welcome
  // guide is closed, and disappears the moment the user switches mode or dismisses it.
  const [coachSeen, setCoachSeen] = useState(() => {
    try { return !!localStorage.getItem("sw-coach-seen"); } catch { return true; }
  });
  const dismissCoach = () => { setCoachSeen(true); try { localStorage.setItem("sw-coach-seen", "1"); } catch { /* */ } };

  // Feedback banner for the CLOSED TEST. A link buried among ten attribution links in the footer
  // is not a feedback mechanism — testers never saw it. Dismissal persists so it asks once rather
  // than nagging, and the footer link remains afterwards as the permanent path.
  // Remove this banner (not the footer link) when the app leaves closed testing.
  // Dismissal lasts a WEEK, not for ever: over a 14-day closed test that prompts each tester
  // twice, which is a reminder rather than a nag. The header flag is the permanent path.
  const [feedbackHidden, setFeedbackHidden] = useState(() => {
    try {
      const t = Number(localStorage.getItem("sw-feedback-seen"));
      return Number.isFinite(t) && t > 0 && Date.now() - t < 7 * 86400000;
    } catch { return true; }
  });
  const dismissFeedback = () => {
    setFeedbackHidden(true);
    try { localStorage.setItem("sw-feedback-seen", String(Date.now())); } catch { /* private mode */ }
  };
  const urlRadius = React.useRef(
    typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("r")) || null : null
  );
  const urlSel = React.useRef(
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ac") : null
  );
  const toggle = (k) => setActive((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k]);

  useEffect(() => {
    if (typeof window === "undefined" || !CATALOG.length || !selectedId) return;
    if (selectedId === "ME-AV" || selectedId === "ME-MR") return; // location-specific: not shareable
    const url = new URL(window.location.href);
    if (url.searchParams.get("feed") === selectedId
      && url.searchParams.get("r") === String(viewRadius || "")
      && (url.searchParams.get("ac") || "") === (viewSel || "")) return;
    url.searchParams.set("feed", selectedId);
    if (viewRadius) url.searchParams.set("r", String(viewRadius));
    if (viewSel) url.searchParams.set("ac", viewSel); else url.searchParams.delete("ac");
    window.history.replaceState(null, "", url);
  }, [selectedId, CATALOG, viewRadius, viewSel]);

  // Marine analogue of openSighting: open a port's radar with a specific vessel
  // pre-selected. Same pendingSel mechanism the aviation path uses.
  const openVessel = useCallback(({ feedId, vesselId }) => {
    setPendingSel(vesselId);
    setSelectedId(feedId);
  }, []);

  // Vessel taps from the LIST reuse the exact routing the map's vessel taps use:
  // nearest marine feed, vessel preselected. One rule, every surface.
  const openVesselFromList = useCallback((v) => {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return;
    let best = null, bestNm = Infinity;
    CATALOG.forEach((f) => {
      if (f.layer !== "marine") return;
      const dNm = Math.hypot((f.lat - v.lat) * 60, (f.lng - v.lon) * 60 * Math.cos(v.lat * Math.PI / 180));
      if (dNm < bestNm) { bestNm = dNm; best = f; }
    });
    if (!best) return;
    setPendingSel(v.id);
    setPendingSelInfo({ label: v.name || v.id, seen: v.lastSeen ? timeAgo(v.lastSeen) : null });
    setSelectedId(best.id);
  }, [CATALOG]);

  const openSighting = useCallback((d) => {
    const feed = CATALOG.find((c) => c.tag === "uav" && c.name.endsWith(d.site))
      || CATALOG.find((c) => c.tag === "uav" && Math.hypot(c.lat - (d.siteLat || 0), c.lng - (d.siteLon || 0)) < 0.5);
    // A TAP MUST NEVER DO NOTHING. There are 240 uav feeds against 1,103 watched sites, so 62
    // named sites and all 799 deep cells had no feed and `return` left the tap dead and silent —
    // Iran, North Korea, Russia and the international waters among them, i.e. the sites people
    // most want to open. The catalog feed was never the point: the contact carries its own site
    // position. Synthesise one, exactly as ME-AV / ME-MR already do for "my location".
    const target = feed || (Number.isFinite(d.siteLat) && Number.isFinite(d.siteLon) ? {
      id: `SITE-${d.site}`, name: `UAV Watch · ${d.site}`, layer: "aviation", tag: "uav",
      city: d.site, region: "—", country: d.country || "", continent: "",
      src: "ADS-B live", url: "https://globe.adsbexchange.com/",
      lat: d.siteLat, lng: d.siteLon,
    } : null);
    if (!target) return;
    setSiteFeed(feed ? null : target);
    setPendingSel(d.id);
    // carry enough context for the radar to explain itself if the aircraft has since left
    setPendingSelInfo({
      label: d.callsign || d.id.toUpperCase(),
      seen: d.lastSeen ? timeAgo(d.lastSeen) : null,
    });
    setViewRadius(250);
    setSelectedId(target.id);
  }, [CATALOG]);

  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const shareFeed = () => {
    const url = `${window.location.origin}/?feed=${encodeURIComponent(selected.id)}`
      + (viewRadius ? `&r=${viewRadius}` : "")
      + (viewSel ? `&ac=${encodeURIComponent(viewSel)}` : "");
    setShareUrl((u) => (u === url ? "" : url)); // toggle the visible link row
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
        .catch(() => {});
    }
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) navigator.share({ title: `StreetWatch — ${selected.name}`, url }).catch(() => {});
  };

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    // NO WIDTH GATE. This was mobile-only because desktop had the radar in a second column,
    // visible without scrolling. One column means a click in the list updates something BELOW THE
    // FOLD on every screen — so the response looks like nothing happened.
    if (viewerRef.current) {
      viewerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

  // Favourites are read ONCE on mount. The setState here is flagged by React Compiler as a
  // synchronous set inside an effect, which can cost one extra render — accepted deliberately:
  // localStorage cannot be read during render, and a lazy useState initialiser would run on the
  // server-less first paint before the browser API is safe to touch.
  useEffect(() => {
    try {
      const v = localStorage.getItem("favorites");
      if (v) setFavorites(JSON.parse(v));
    } catch {
      // PRIVATE BROWSING throws on localStorage access, and a corrupt value throws in JSON.parse.
      // Both mean "no saved favourites", which is a fine state to start in. Swallowed on purpose —
      // the empty block was flagged by no-empty, and the fix is saying WHY, not adding a log
      // nobody reads.
    }
  }, []);
  const isFav = (id) => favorites.includes(id);
  const toggleFav = (id) => setFavorites((f) => {
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {
      // Same as above: private browsing, or the quota is full. The favourite still applies for
      // this session — it just will not survive a reload. Losing a star is not worth an alert.
    }
    return next;
  });
  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoErr("Location unavailable on this device"); return; }
    setGeoErr("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setUserLoc(loc); setNearMe(true); setGeoErr(null); setContinent("All"); setCountry("All");
        // Previously this only re-sorted the LIST, so the map stayed wherever it was and the
        // radar and nearby-cams kept showing the previously selected feed — London, for a first
        // visit. "Near me" has to move everything that has a location, or it half-lies.
        let best = null, bestKm = Infinity;
        CATALOG.forEach((c) => {
          if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;  // ISS has no fixed point
          const d = distKm(loc.lat, loc.lng, c.lat, c.lng);
          if (d < bestKm) { bestKm = d; best = c; }
        });
        if (best) { setPendingSel(null); setPendingSelInfo(null); setSelectedId(best.id); }
      },
      () => setGeoErr("Location permission denied"),
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const continents = useMemo(() => ["All", ...Array.from(new Set(CATALOG.map((c) => c.continent))).sort()], [CATALOG]);
  const countries = useMemo(() => ["All", ...Array.from(new Set(
    CATALOG.filter((c) => continent === "All" || c.continent === continent).map((c) => c.country))).sort()], [continent, CATALOG]);

  // searchable text per feed, accent-stripped, computed once per catalogue
  const searchText = useMemo(() => {
    const m = new Map();
    CATALOG.forEach((c) => {
      const t = norm([c.name, c.city, c.region, c.country, c.continent, c.id, LAYERS[c.layer].label].join(" "));
      m.set(c.id, { t, w: words(t) });      // split once here, not per keystroke
    });
    return m;
  }, [CATALOG]);

  const search = useMemo(() => {
    const q = norm(query.trim());
    const base = CATALOG.filter((c) => {
      const hitReg = (continent === "All" || c.continent === continent) && (country === "All" || c.country === country);
      const hitTab = tab === "drones" ? c.tag === "uav" : c.tag !== "uav"; // UAV feeds live only in the Drones tab
      return hitReg && hitTab && active.includes(c.layer) && (!favOnly || favorites.includes(c.id));
    });
    if (!q) return { list: base, fuzzy: 0 };

    const exact = base.filter((c) => { const e = searchText.get(c.id); return e && e.t.includes(q); });
    // only reach for fuzzy matching when the plain search came up short — it costs more,
    // and when there are plenty of literal matches the user almost certainly wants those
    if (exact.length >= 5 || q.length < 4) return { list: exact, fuzzy: 0 };

    const budget = budgetFor(q);
    // Cheap prefilter before the expensive edit-distance pass: real typos almost always
    // preserve the first couple of letters ("heatrow", "amsterdm", "frankfrut"). This cuts
    // ~7,300 candidates to a few hundred. Tradeoff: a typo IN the first two letters wont
    // be caught — worth it to keep typing responsive on modest hardware.
    const head = q.slice(0, 2);
    const near = base.filter((c) => {
      const e = searchText.get(c.id);
      return e && !e.t.includes(q) && e.t.includes(head) && fuzzyHit(e.w, q, budget);
    });
    return { list: exact.concat(near), fuzzy: near.length };
  }, [query, active, continent, country, favOnly, favorites, tab, CATALOG, searchText]);

  // ARCHIVE SEARCH — a SECOND search, over AIRCRAFT rather than places.
  // setAcHits is called only inside the debounced callback and the cleanup, never synchronously on
  // the render path: React Compiler flags a synchronous set inside an effect, and on a search box
  // that fires per keystroke it is a real cascade rather than a style nit.
  const [acHits, setAcHits] = useState(null);   // null = not searched · [] = searched, no match
  const [acBusy, setAcBusy] = useState(false);
  useEffect(() => {
    const q = query.trim();
    // 3 characters minimum. Shorter prefixes match a large slice of the archive and the round trip
    // is wasted — "ae" alone is most US military airframes.
    if (q.length < 3) {
      const id = setTimeout(() => { setAcHits(null); setAcBusy(false); }, 0);
      return () => clearTimeout(id);
    }
    let alive = true;
    const t = setTimeout(() => {
      setAcBusy(true);
      fetch(`${BACKEND_URL}/api/drones/history?days=90&limit=8&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive) { setAcHits(j && Array.isArray(j.contacts) ? j.contacts : []); setAcBusy(false); } })
        .catch(() => { if (alive) { setAcHits([]); setAcBusy(false); } });
    }, 350);   // the catalog filter is instant; this is a database query, so it waits for a pause
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const results = search.list;

  const selected =
    (selectedId === "ME-AV" && userLoc && { id: "ME-AV", name: "Radar over my location", layer: "aviation", city: "Your location", region: "—", country: "", continent: "", src: "ADS-B live", url: "https://globe.adsbexchange.com/", lat: userLoc.lat, lng: userLoc.lng }) ||
    (selectedId === "ME-MR" && userLoc && { id: "ME-MR", name: "Ships near my location", layer: "marine", city: "Your location", region: "—", country: "", continent: "", src: "AIS live", url: "https://www.marinetraffic.com/", lat: userLoc.lat, lng: userLoc.lng }) ||
    (siteFeed && siteFeed.id === selectedId && siteFeed) ||
    CATALOG.find((c) => c.id === selectedId) || results[0] || CATALOG[0];

  const grouped = useMemo(() => {
    const g = {};
    results.forEach((c) => { (g[c.continent] = g[c.continent] || []).push(c); });
    Object.values(g).forEach((arr) => arr.sort((a, b) => (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0)));
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, favorites]);

  const nearList = useMemo(() => {
    if (!nearMe || !userLoc) return null;
    return results.map((c) => ({ ...c, distKm: distKm(userLoc.lat, userLoc.lng, c.lat, c.lng) })).sort((a, b) => a.distKm - b.distKm);
  }, [nearMe, userLoc, results]);

  const renderRow = (c) => {
    const sel = c.id === selected.id; const L = LAYERS[c.layer]; const Icon = L.icon; const fav = isFav(c.id);
    return (
      <button key={c.id} onClick={() => setSelectedId(c.id)} className="sw-row w-full text-left px-4 py-2.5 flex items-center gap-3"
        style={{ background: sel ? C.panel2 : "transparent", borderLeft: `2px solid ${sel ? L.color : "transparent"}`, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-center flex-shrink-0 rounded" style={{ width: 30, height: 30, background: C.ink, border: `1px solid ${C.line}` }}>
          <Icon size={14} color={sel ? L.color : C.dim} />
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 13, color: C.text, fontWeight: sel ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
          <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>{c.city} · {c.country}{c.distKm != null ? ` · ${Math.round(c.distKm * 0.621371).toLocaleString()} miles` : ""}</div>
        </div>
        {["traffic", "webcam", "wildlife"].includes(c.layer) &&
          <ExternalLink size={11} color={C.faint} style={{ flexShrink: 0 }} aria-label="opens external site" />}
        <span role="button" tabIndex={0} aria-label="favorite"
          onClick={(e) => { e.stopPropagation(); toggleFav(c.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFav(c.id); } }}
          style={{ cursor: "pointer", display: "flex", padding: 3 }}>
          <Star size={15} color={fav ? C.amber : C.faint} fill={fav ? C.amber : "none"} />
        </span>
      </button>
    );
  };

  const Preview = (selected && LAYERS[selected.layer].camera) ? LiveViewport : DataPreview;

  if (!CATALOG.length) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.ink, color: C.text }}>
        <div className="text-center">
          <div className="font-mono" style={{ fontSize: 12, color: C.amber, letterSpacing: 2 }}>STREETWATCH</div>
          <div className="mt-2 font-mono" style={{ fontSize: 11, color: C.dim }}>
            {catalogErr ? "Couldn't load the feed catalog — check connection and reload." : "loading 5,000+ live feeds…"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: "100%", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes pdot { 0%,100%{opacity:1} 50%{opacity:.4} }
        .pulse-dot{ animation: pdot 1.4s ease-in-out infinite; }
        @keyframes ping { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.6);opacity:0} }
        .mk-ping{ animation: ping 1.8s ease-out infinite; }
        @keyframes rsweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .rsweep{ transform-origin:200px 200px; animation: rsweep 4s linear infinite; }
        @keyframes rblip { 0%,100%{opacity:1} 50%{opacity:.45} }
        .rblip{ animation: rblip 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .pulse-dot,.mk-ping,.rsweep,.rblip{ animation:none !important } }
        .sw-input::placeholder{ color:${C.faint}; }
        .sw-row:hover{ background:${C.panel2} !important; }
        button:focus-visible,input:focus-visible{ outline:2px solid ${C.cyan}; outline-offset:2px; }
      `}</style>

      <Intro open={introOpen} onClose={closeIntro} feedCount={CATALOG.length} />
      <header className="flex flex-wrap items-center justify-between gap-y-2 px-4 md:px-6 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-label="StreetWatch">
            <rect width="64" height="64" rx="14" fill={C.amber} />
            <circle cx="32" cy="32" r="21" fill="none" stroke={C.ink} strokeWidth="3" opacity="0.5" />
            <path d="M32 32 L32 9 A23 23 0 0 1 51.5 21.5 Z" fill={C.ink} />
            <circle cx="32" cy="32" r="4" fill={C.ink} />
          </svg>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: 0.3, fontSize: 15 }}>STREETWATCH</div>
            <div className="font-mono" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>LIVE PLANET CONSOLE</div>
          </div>
        </div>
        <nav className="flex items-center justify-center gap-1 w-full sm:w-auto order-3 sm:order-none">
          {/* Permanent path to the feedback form. The banner below asks once and then steps aside;
              without this, a tester who dismissed it had nowhere to go but a footer link sitting
              among ten attributions. */}
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSeg3Xj8j48amg8CAB1k14Wgkd88MRe6oWvNK6p6mVzQfmXMEg/viewform" target="_blank" rel="noreferrer"
            aria-label="Report a problem" title="Report a problem"
            className="flex items-center justify-center rounded"
            style={{ width: 30, height: 30, color: C.amber, background: "transparent", border: `1px solid ${C.amber}55` }}>
            <Flag size={14} />
          </a>
          <button onClick={() => setIntroOpen(true)} aria-label="What is StreetWatch? Open the guide"
            title="What is this? How do I use it?"
            className="flex items-center justify-center rounded"
            style={{ width: 30, height: 30, color: C.dim, background: "transparent", border: `1px solid ${C.line}` }}>
            <HelpCircle size={15} />
          </button>
          {/* Primary mode switch. Grouped in one pill with a shared border so it reads as a
              two-way toggle — the single most important control for a first-time visitor, who
              otherwise cannot tell the world browser from the drone watch. */}
          {!feedbackHidden && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2 font-mono"
              style={{ border: `1px solid ${C.amber}55`, background: "rgba(246,168,33,0.09)", fontSize: 11 }}>
              <span style={{ color: C.amber, flex: 1 }}>
                Help us test — tell us anything that looks wrong.{" "}
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSeg3Xj8j48amg8CAB1k14Wgkd88MRe6oWvNK6p6mVzQfmXMEg/viewform" target="_blank" rel="noreferrer" onClick={dismissFeedback}
                  style={{ color: C.amber, textDecoration: "underline" }}>Report a problem</a>
              </span>
              <button onClick={dismissFeedback} aria-label="Dismiss"
                style={{ color: C.dim, padding: "0 4px", lineHeight: 1 }}>×</button>
            </div>
          )}
          <div className="tabpill flex items-center rounded-lg" style={{ border: `1px solid ${C.line}`, padding: 2, background: C.panel2,
            minWidth: 0, overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
            {[{ k: "drones", label: "Drones", icon: Plane, hint: "military watch" },
              { k: "world", label: "World", icon: Globe, hint: "all feeds" },
              { k: "cyber", label: "Cyber", icon: Shield, hint: "attacks & outages" },
              { k: "space", label: "Space", icon: Satellite, hint: "orbital tracking" }].map((t) => (
              <button key={t.k} onClick={() => { setTab(t.k); dismissCoach(); }}
                aria-pressed={tab === t.k}
                className="flex items-center gap-1.5 rounded"
                style={{ padding: "6px 12px", fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
                  color: tab === t.k ? C.ink : C.dim,
                  background: tab === t.k ? C.amber : "transparent", transition: "background .15s" }}>
                <t.icon size={14} />
                <span>{t.label}</span>
                <span className="hidden sm:inline" style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>· {t.hint}</span>
              </button>
            ))}
          </div>
        </nav>
      </header>

      {!introOpen && !coachSeen && (
        <div className="flex justify-end px-4 md:px-6" style={{ marginTop: -4 }}>
          <div className="flex items-start gap-2 rounded-lg" role="button" tabIndex={0} onClick={dismissCoach}
            style={{ maxWidth: 300, marginRight: 40, padding: "8px 12px", cursor: "pointer",
              background: C.amber, color: C.ink, fontSize: 12, lineHeight: 1.4,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
            <span style={{ fontSize: 14 }}>↑</span>
            <span>You are on <b>Drones</b> — the military &amp; UAV watch. <b>World</b> browses all 7,000+ public feeds. Switch here anytime. <span style={{ opacity: 0.7 }}>(tap to dismiss)</span></span>
          </div>
        </div>
      )}

      {/* ONE COLUMN. The two-column layout gave the filters a tall narrow sidebar and squeezed
          the map, list, radar and briefing into what was left. The filters are now a bar across
          the top and everything else runs full width beneath. */}
      <div className="flex flex-col" style={{ minHeight: "calc(100vh - 58px)" }}>
        {/* resize: horizontal gives desktop users a native drag handle (bottom-right corner
            of the panel) to widen or narrow the list — no JS, no library, remembered nowhere
            on purpose (refresh restores the default). Phones keep the stacked layout. */}
        <aside className="w-full flex-shrink-0" style={{ background: C.panel }}>
          {/* COLUMN, not a wrapping row. As a row every filter group was a flex ITEM, so they sat
              side by side and only broke when width ran out — LAYERS beside the search box, REGION
              beside the country dropdown, and each group's label separated from the controls it
              named. That is what two testers described as options sharing a line with nothing
              saying which control they belonged to. A column gives each group its own row at every
              width, and the centring inside each row then actually applies. */}
          <div className="p-3 flex flex-col items-stretch gap-y-2" style={{ borderBottom: `1px solid ${C.line}` }}>
            {/* The search box filters the FEED CATALOG. On Cyber there is no catalog, so typing
                did nothing at all — a control that cannot act is worse than no control. */}
            {browsesFeeds && (
            <div className="flex items-center gap-2 px-3 rounded" style={{ background: C.ink, border: `1px solid ${C.line}`, height: 40 }}>
              <Search size={16} color={C.faint} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="sw-input bg-transparent w-full"
                placeholder="Continent, country, city, layer…" style={{ color: C.text, fontSize: 14, border: "none" }} />
              {query && <button onClick={() => setQuery("")}><X size={15} color={C.faint} /></button>}
              {query.trim().length > 8 && AIS_BACKEND_URL && (
                <button onClick={() => askAi(query)} disabled={aiBusy} title="Interpret this as a question"
                  className="flex-shrink-0 flex items-center justify-center rounded"
                  style={{ width: 26, height: 26, color: aiBusy ? C.faint : "#C084FC",
                    background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.35)" }}>
                  <Sparkles size={13} />
                </button>
              )}
            </div>
            )}
            {aiQuery && (
              <div className="font-mono mt-1.5 rounded" style={{ fontSize: 9.5, lineHeight: 1.6,
                color: C.dim, background: C.panel2, border: `1px solid ${C.line}`, padding: "6px 8px" }}>
                {aiQuery.error ? (
                  <span>Could not interpret that ({aiQuery.error}). Normal search still works.</span>
                ) : (
                  <>
                    <span style={{ color: "#C084FC" }}>INTERPRETED AS</span>{" "}
                    {Object.entries(aiQuery.filter).map(([k, v]) =>
                      `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(" · ")}
                    <button onClick={() => setAiQuery(null)} style={{ marginLeft: 6, color: C.faint }}>clear</button>
                  </>
                )}
              </div>
            )}
            {/* The whole filter apparatus — layer chips, region, country, LIST/MAP — belongs to
                feed browsing. On Cyber there is no catalog to filter, so these would offer to
                narrow a list that does not exist. */}
            {browsesFeeds && (<>
            {/* Each filter group gets its OWN centred row with its label beside it. Left-aligned
                blocks with the label floating above wrapped into each other on a phone — two
                testers reported options sharing a line with nothing saying which control they
                belonged to. Centring also matches the tab pill and the Space tab controls. */}
            <div className="font-mono flex items-center justify-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 2 }}>LAYERS</span>
              {tabLayers.map((k) => {
                const L = LAYERS[k]; const on = active.includes(k); const Icon = L.icon;
                return (
                  <button key={k} onClick={() => toggle(k)} className="flex items-center gap-1 px-2 py-1 rounded"
                    style={{ fontSize: 11, color: on ? C.ink : C.dim, background: on ? L.color : C.panel2,
                      border: `1px solid ${on ? L.color : C.line}` }}>
                    <Icon size={12} />{L.label}
                  </button>
                );
              })}
            </div>
            {/* Row 3 — region */}
            <div className="font-mono flex items-center justify-center gap-1.5 flex-wrap" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 2 }}>REGION</span>
              {continents.map((ct) => (
                <button key={ct} onClick={() => { setContinent(ct); setCountry("All"); }}
                  className="px-2 py-1 rounded font-mono flex-shrink-0"
                  style={{ fontSize: 11, whiteSpace: "nowrap",
                    color: continent === ct ? C.ink : C.dim,
                    background: continent === ct ? C.cyan : C.panel2,
                    border: `1px solid ${continent === ct ? C.cyan : C.line}` }}>
                  {ct === "North America" ? "N. America" : ct === "South America" ? "S. America" : ct}
                </button>
              ))}
            </div>
            {/* aria-label because the visible "REGION" heading above is a plain div, not a
                <label>, so nothing associates it with this control programmatically. A screen
                reader announced an unlabelled dropdown. Flagged by the Aug 2 accessibility
                audit — the only failure that was not the C.faint contrast problem. */}
            {/* Row 4 — country */}
            <div className="flex items-center justify-center" style={{ marginTop: 6 }}>
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              aria-label="Filter feeds by country"
              className="px-2.5 rounded font-mono"
              style={{ height: 30, fontSize: 12, color: C.text, background: C.ink,
                border: `1px solid ${C.line}`, minWidth: 150, maxWidth: 200 }}>
              {countries.map((cn) => <option key={cn} value={cn} style={{ background: C.panel }}>{cn === "All" ? "All countries" : cn}</option>)}
            </select>
            </div>
            {(continent !== "All" || country !== "All") && (
              <button onClick={() => { setContinent("All"); setCountry("All"); }}
                className="mt-2 font-mono flex items-center justify-center gap-1 w-full" style={{ fontSize: 10, color: C.faint }}>
                <X size={11} /> clear region
              </button>
            )}
              {/* AIRCRAFT — archive matches, shown ABOVE the places. A callsign is a more specific
                  query than a place name, so if someone typed one they almost certainly meant it. */}
              {acHits !== null && (
                <div style={{ borderBottom: `1px solid ${C.line}` }}>
                  <div className="px-4 py-2.5 font-mono flex items-center gap-1.5"
                    style={{ fontSize: 10, color: C.faint, letterSpacing: 1, background: C.ink,
                      borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                    <Plane size={11} />AIRCRAFT · {acBusy ? "searching…" : acHits.length}
                  </div>
                  {/* NOT CLICKABLE, deliberately. openSighting needs siteLat/siteLon to centre a
                      radar, and archive rows do not carry them, so the click silently did nothing.
                      Opening a LIVE radar would also answer the wrong question: most archived
                      airframes are not flying when you look them up, so it would be empty and read
                      as "no data" rather than "not airborne".
                      The row already answers what someone typing a callsign is asking — type, how
                      often seen, where last seen. The proper destination is DroneSweep's existing
                      track panel, which needs a cross-component handoff (an openIcao prop and a tab
                      switch) and deserves doing on its own rather than bolted on here. */}
                  {acHits.map((a) => (
                    <div key={a.icao}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3"
                      style={{ borderLeft: "2px solid transparent", borderBottom: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-center flex-shrink-0 rounded"
                        style={{ width: 30, height: 30, background: C.ink, border: `1px solid ${C.line}` }}>
                        <Plane size={14} color={a.kind === "uav" ? "#C084FC" : C.amber} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.text }}>
                          {a.callsign || a.icao}
                          <span className="font-mono" style={{ fontSize: 10, color: C.dim, marginLeft: 6 }}>
                            {a.icao}
                          </span>
                        </div>
                        <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>
                          {a.descr || a.type_code || "unknown type"} · {a.points}{"\u00a0"}sighting{String(a.points) === "1" ? "" : "s"}
                          {a.last_site ? ` · last near ${a.last_site}` : ""}
                          {/* WHEN. Without a date these read as LIVE aircraft — the user's first
                              reaction on seeing the results was "maybe they are past records".
                              They are: archived sightings over up to 90 days. The API returns
                              last_seen and the row simply was not showing it. A date makes "past
                              record" obvious without a word of explanation, which is the better
                              version of the honesty this project keeps reaching for. */}
                          {a.last_seen ? ` · ${fmtDate(a.last_seen)}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!acBusy && acHits.length === 0 && (
                    <div className="px-4 py-2.5" style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                      No military or UAV contact matching “{query.trim()}” in the archive.
                      {/* SAY WHY. This archive is military and UAV ONLY, by design — civil traffic is
                          never stored. Without this line, someone typing a commercial flight number
                          reads an empty result as a broken search rather than as out of scope. */}
                      <span style={{ display: "block", color: C.faint, fontSize: 10, marginTop: 2 }}>
                        Only military and UAV aircraft are archived — civil flights are never stored.
                      </span>
                    </div>
                  )}
                </div>
              )}
            {nearMe && !geoErr && (
              <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
                sorted by distance from you · map centred on you · nearest feed opened
                {selected ? ` (${selected.name}${userLoc ? `, ${Math.round(distKm(userLoc.lat, userLoc.lng, selected.lat, selected.lng) * 0.621371)} miles` : ""})` : ""}
                 · layer chips still filter
              </div>
            )}
            {search.fuzzy > 0 && (
              <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>
                few exact matches — showing {search.fuzzy} close spelling{search.fuzzy === 1 ? "" : "s"} too
              </div>
            )}
            {/* Row 5 — favourites and location */}
            <div className="flex items-center justify-center gap-1 mt-2">
              {/* BOTH options shown, active one filled — the single chip displayed only the
                  CURRENT state, so it read as a label rather than a control and gave no hint what
                  the alternative was. Same shape and colours as the LIST/MAP pair beside it. */}
              {/* A LABEL. Two buttons reading UTC and LOCAL with nothing beside them do not say
                  they are about time — the tab row next to this has VIEW, and this had nothing. */}
              <button onClick={() => setFavOnly((v) => !v)} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 10, color: favOnly ? C.ink : C.dim, background: favOnly ? C.amber : C.panel2, border: `1px solid ${favOnly ? C.amber : C.line}` }}>
                <Star size={11} fill={favOnly ? C.ink : "none"} /> Favorites
              </button>
              <button onClick={() => (nearMe ? setNearMe(false) : locateMe())} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 10, color: nearMe ? C.ink : C.dim, background: nearMe ? C.cyan : C.panel2, border: `1px solid ${nearMe ? C.cyan : C.line}` }}>
                <Navigation size={11} /> Near me
              </button>
            </div>
            {/* Row 6 — clock and the result count. Split from the row above because four controls
                and a count wrapped mid-group on a phone, leaving UTC and LOCAL orphaned on a line
                with nothing explaining them. */}
            <div className="flex items-center justify-center gap-1 mt-2">
              <span className="font-mono" style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginRight: 4 }}>TIMES</span>
              {[[true, "UTC"], [false, "LOCAL"]].map(([v, label]) => (
                <button key={label} onClick={() => { setUtc(v); bumpTz((n) => n + 1); }}
                  className="px-2.5 py-1 rounded font-mono"
                  title="Aviation runs on UTC — flight plans, NOTAMs and clearances are all Zulu."
                  style={{ fontSize: 10, letterSpacing: 0.5,
                    color: isUtc() === v ? C.ink : C.dim,
                    background: isUtc() === v ? C.cyan : C.panel2,
                    border: `1px solid ${isUtc() === v ? C.cyan : C.line}` }}>
                  {label}
                </button>
              ))}
              <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>
                {`${results.length.toLocaleString()} feeds`}
              </span>
            </div>
            </>)}
            {geoErr === "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>locating…</div>}
            {geoErr && geoErr !== "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: "#F0553B" }}>{geoErr}</div>}
          </div>


        </aside>
        {/* THE DIVIDER IS GONE. It resized two columns; there is one now. */}

        {/* The VIEWER, not the browser. Both sections below are driven by `selected` — a feed from
            the catalog — so on Cyber they showed a world map and a traffic camera beside panels
            about attack traffic. Gating the left panel was only half the job.
            The divider above is hidden too: dragging to resize a pane that is not there is worse
            than no handle at all. */}
        {/* CYBER OWNS THE WHOLE RIGHT-HAND AREA. It used to render inside the <aside>, which is a
            narrow list column — the map came out cramped and unexplorable, while <main> sat hidden
            and empty beside it. The panels are the page here, not an item in a list. */}
        {tab === "cyber" && (
          <main className="flex-1 px-4 py-4 md:px-10 md:py-6 lg:px-16" style={{ minWidth: 0 }}>
            <CyberView />
          </main>
        )}
        {/* SPACE OWNS THE WHOLE AREA, for the same reason CYBER does: one global view with no
            site to pick. It used to be a layer whose single ISS feed had to be selected before the
            orbital map appeared inside the narrow radar panel — so the category toggles were three
            clicks deep and effectively invisible. */}
        {tab === "space" && (
          <main className="flex-1 px-4 py-4 md:px-10 md:py-6 lg:px-16" style={{ minWidth: 0 }}>
            <SpaceView />
          </main>
        )}
        {browsesFeeds && (
        <main className="flex-1 px-4 py-4 md:px-10 md:py-6 lg:px-16 flex flex-col gap-4">

          {/* The MAP PANEL is the LIST's alternative — the LIST/MAP toggle picks one or the other —
              so it belongs next to it, not back in the filter column. Moved with stage 1's list. */}
          {/* ONE MAP. There were TWO — a bare WorldMap in the viewer and this below it in MAP
              mode — the same component twice, disguised by two columns and obvious in one.
              MapPanel is the survivor: it carries six layer toggles, five fetches (live, heat,
              USV, sub, advisories), the live and activity windows, and the radius chips. The bare
              one had four props.
              THE FEED THINNING COMES ACROSS. Above 2,000 feeds the viewer drew only major, UAV and
              non-aviation/marine markers; MapPanel took `results` whole. 7,448 markers is slow and
              mobile performance is already the weak number.
              LIST/MAP is meaningless now — the map is always here and the list sits beneath it. */}
          {browsesFeeds && (
            <div className="mb-3">
              <MapPanel feeds={results.length > 2000 ? results.filter((c) => c.major || c.tag === "uav" || !["aviation", "marine"].includes(c.layer)) : results} selectedId={selected ? selected.id : null}
                userLoc={nearMe ? userLoc : null} tab={tab}
                onSelect={setSelectedId} onOpenSighting={openSighting} onOpenVessel={openVessel} />
            </div>
          )}

          {/* STAGE 1 of the layout restructure: the feed list moved OUT of the narrow left column
              and INTO the main area, above the radar. The aside kept the filters; everything else
              is unchanged for now — the divider and the two columns still exist.
              The 46vh cap and the lg:max-h-none that removed it on desktop came with it: on a wide
              screen the list is no longer competing with the filters for the same column. */}
          {/* THE SWEEP IS THE DRONES TAB, so it goes ABOVE the feed list and OUTSIDE its
              container. It was rendering INSIDE a box capped at 46vh with its own scroll — so the
              tab's main feature was squeezed into a scrolling panel, narrower than the map beside
              it, and below a 240-row feed list. Nothing told a reader it was there at all. */}
          {tab === "drones" && <DroneSweep onOpen={openSighting} onOpenVessel={openVesselFromList} />}

          <div style={{ maxHeight: "46vh", overflowY: "auto" }} className="lg:max-h-none">
            {tab === "drones" && (
              <div className="mx-4 mt-2 mb-1 rounded px-3 py-2" style={{ background: "rgba(192,132,252,0.10)", border: "1px solid rgba(192,132,252,0.35)", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                <b style={{ color: "#C084FC" }}>◇ UAV WATCH</b> — radars over airspaces where category-B6 drones actually fly.
                Sightings are sporadic; an empty radar is honest. Use 250nm range.
              </div>
            )}
            {browsesFeeds && (
            <div className="px-4 py-2 font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <span>{results.length} FEEDS</span><span>{nearList ? "NEAREST FIRST" : grouped.length + " REGIONS"}</span>
            </div>
            )}
            {browsesFeeds && results.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ color: C.dim, fontSize: 13 }}>
                {favOnly ? "No favorites yet — tap the ☆ on any feed to save it." : "No feeds match. Try “Asia”, “Tokyo”, or enable more layers."}
              </div>
            )}
            {browsesFeeds && (nearList
              ? [
                  <button key="ME-AV" onClick={() => setSelectedId("ME-AV")} className="w-full text-left px-4 py-2.5 flex items-center gap-3"
                    style={{ background: selectedId === "ME-AV" ? C.panel2 : "rgba(34,211,238,0.06)", borderLeft: `2px solid ${C.cyan}`, borderBottom: `1px solid ${C.line}` }}>
                    <Navigation size={15} color={C.cyan} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Radar over my location</span>
                    <span className="font-mono ml-auto" style={{ fontSize: 10, color: C.cyan }}>LIVE HERE</span>
                  </button>,
                  <button key="ME-MR" onClick={() => setSelectedId("ME-MR")} className="w-full text-left px-4 py-2.5 flex items-center gap-3"
                    style={{ background: selectedId === "ME-MR" ? C.panel2 : "rgba(34,211,238,0.06)", borderLeft: `2px solid ${C.cyan}`, borderBottom: `1px solid ${C.line}` }}>
                    <Navigation size={15} color={C.cyan} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Ships near my location</span>
                    <span className="font-mono ml-auto" style={{ fontSize: 10, color: C.cyan }}>LIVE HERE</span>
                  </button>,
                  ...nearList.map((c) => renderRow(c)),
                ]
              : grouped.map(([cont, items]) => {
                const open = !!query.trim() || favOnly || !!openGroups[cont];
                return (
                  <div key={cont}>
                    <button onClick={() => setOpenGroups((g) => ({ ...g, [cont]: !g[cont] }))}
                      className="w-full px-4 py-2.5 font-mono flex items-center justify-between"
                      style={{ fontSize: 10, color: C.faint, letterSpacing: 1, background: C.ink, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                      <span className="flex items-center gap-1.5"><Globe size={11} />{cont.toUpperCase()} · {items.length}</span>
                      <span style={{ color: C.dim, fontSize: 12, transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>›</span>
                    </button>
                    {open && items.slice(0, 300).map((c) => renderRow(c))}
                    {open && items.length > 300 && (
                      <div className="px-4 py-2.5 font-mono" style={{ fontSize: 10, color: C.faint }}>
                        + {items.length - 300} more — narrow with search or the country filter
                      </div>
                    )}
                  </div>
                );
              }))}
          </div>
          {/* viewerRef LIVES HERE NOW. It was attached to the bare WorldMap section, which was
              deleted with the duplicate map — so viewerRef.current was null and the scroll-to-view
              silently did nothing. The radar is the right target anyway: it is what CHANGES when a
              contact is clicked. */}
          <section ref={viewerRef} className="flex flex-col md:flex-row gap-4" style={{ scrollMarginTop: 8 }}>
            <div className="flex-1 min-w-0">
              {selected.layer === "aviation"
                ? <AviationRadar key={`${selected.id}:${pendingSel || ""}`}
                    center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }}
                    initialRadius={pendingSel ? 250 : urlRadius.current} onRadius={setViewRadius}
                    defaultRadius={selected.tag === "uav" ? 250 : 100}
                    initialSel={pendingSel || urlSel.current}
                    initialSelLabel={pendingSelInfo && pendingSelInfo.label}
                    initialSelSeen={pendingSelInfo && pendingSelInfo.seen}
                    onSelect={setViewSel} />
                : selected.layer === "marine"
                ? <MarineRadar key={`${selected.id}:${pendingSel || ""}`} center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }}
                    initialRadius={pendingSel ? 100 : urlRadius.current} onRadius={setViewRadius}
                    initialSel={pendingSel || urlSel.current}
                    initialSelLabel={pendingSelInfo && pendingSelInfo.label}
                    initialSelSeen={pendingSelInfo && pendingSelInfo.seen}
                    onSelect={setViewSel} />
                : selected.layer === "weather"
                ? <EarthView center={{ lat: selected.lat, lng: selected.lng, name: selected.name, city: selected.city }} />
                : selected.layer === "space"
                ? <SpaceView />
                : <Preview cam={selected} now={now} onOpen={() => openLive(selected)} />}
            </div>
            <div className="w-full md:w-64 flex-shrink-0 rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <div className="font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
                <span className="flex items-center gap-1.5">
                  {React.createElement(LAYERS[selected.layer].icon, { size: 12, color: LAYERS[selected.layer].color })}
                  {LAYERS[selected.layer].label.toUpperCase()} FEED
                </span>
                <button onClick={() => toggleFav(selected.id)} aria-label="favorite" style={{ display: "flex" }}>
                  <Star size={16} color={isFav(selected.id) ? C.amber : C.faint} fill={isFav(selected.id) ? C.amber : "none"} />
                </button>
              </div>
              <div className="flex items-start gap-2" style={{ marginTop: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{selected.name}</div>
                {selected.id !== "ME-AV" && selected.id !== "ME-MR" && (
                  <button onClick={shareFeed} className="px-2 py-1 rounded font-mono flex items-center gap-1" title="Copy a link to this feed"
                    style={{ fontSize: 10, color: copied ? C.ink : C.dim, background: copied ? LAYERS[selected.layer].color : "transparent", border: `1px solid ${C.line}`, flexShrink: 0 }}>
                    <Share2 size={11} />{copied ? "COPIED" : "SHARE"}
                  </button>
                )}
              </div>
              {shareUrl && (
                <div className="mt-1.5 flex items-center gap-2 rounded px-2 py-1.5" style={{ background: C.panel2, border: `1px solid ${C.line}` }}>
                  <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} onClick={(e) => e.target.select()}
                    className="font-mono flex-1" style={{ fontSize: 11, color: C.text, background: "transparent", border: "none", outline: "none", minWidth: 0 }} />
                  <span className="font-mono" style={{ fontSize: 9, color: copied ? LAYERS[selected.layer].color : C.faint, whiteSpace: "nowrap" }}>
                    {copied ? "COPIED ✓" : "tap to select"}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1" style={{ color: C.dim, fontSize: 13 }}>
                <MapPin size={13} color={LAYERS[selected.layer].color} /> {selected.city}, {selected.country}
              </div>
              <div className="mt-4 space-y-2 font-mono" style={{ fontSize: 12 }}>
                {[["CONTINENT", selected.continent], ["REGION", selected.region], ["SOURCE", selected.src], ["COORD", (Number.isFinite(selected.lat) && Number.isFinite(selected.lng)) ? `${selected.lat.toFixed(2)}, ${selected.lng.toFixed(2)}` : "live · see tracker"]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 6 }}>
                    <span style={{ color: C.faint }}>{k}</span><span style={{ color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => openLive(selected)} className="mt-4 w-full flex items-center justify-center gap-2 rounded py-2.5 font-mono"
                style={{ background: LAYERS[selected.layer].color, color: C.ink, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, border: "none", cursor: "pointer" }}>
                <ExternalLink size={15} /> OPEN SOURCE
              </button>
              <div className="mt-2 font-mono break-all" style={{ fontSize: 10, color: C.faint }}>↗ {resolveUrl(selected)}</div>
            </div>
          </section>

          {/* Own full-width row: expanding the cam grid grows the page downward, and the radar
              above keeps its size — previously cams shared the radar's flex row and opening
              them squeezed the radar sideways. */}
          <section className="rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.panel }}>
            <NearbyCams lat={selected.lat} lon={selected.lng} name={selected.name} />
          </section>

          <section className="rounded-lg p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="font-mono flex items-center gap-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <SignalHigh size={12} color={C.amber} /> PUBLISHED PUBLIC FEEDS ONLY
            </div>
            <p style={{ fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 1.6 }}>
              {/* This is the ONE place the terms get introduced, so they are spelled out here and
                  used plainly everywhere else. Dropping the technical dropped nothing: the
                  cross-origin/RTSP sentence explained an implementation detail no reader needs. */}
              Every layer draws only on feeds published for public viewing: traffic authorities, the open networks where
              aircraft and ships broadcast their own positions (ADS-B and AIS), government and space-agency imagery, and
              public webcam directories. Clicking a feed opens the source's own page.
              Private cameras of private spaces — homes, shop interiors, anything reachable only because it is unsecured —
              are deliberately excluded. Viewing those is unauthorized access, not public data.
            </p>
          </section>
        </main>
        )}
      </div>
      <footer className="px-4 md:px-6 py-2.5 font-mono flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
        style={{ borderTop: `1px solid ${C.line}`, fontSize: 9.5, color: C.faint, letterSpacing: 0.4 }}>
        <span>
          DATA&nbsp;
          <a href="https://airplanes.live" target="_blank" rel="noreferrer" style={{ color: C.dim }}>airplanes.live</a> ·{" "}
          <a href="https://aisstream.io" target="_blank" rel="noreferrer" style={{ color: C.dim }}>aisstream.io</a> ·{" "}
          <a href="https://www.digitraffic.fi" target="_blank" rel="noreferrer" style={{ color: C.dim }}>Fintraffic</a> ·{" "}
          <a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noreferrer" style={{ color: C.dim }}>NASA</a> ·{" "}
          {/* Tester feedback during the closed test. Deliberately a hosted form rather than a field
              on this page: free text typed into our own site is user-generated content, which brings
              moderation duties and a privacy-policy change we do not need mid-review. The form asks
              for no name, no email and no account. */}
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSeg3Xj8j48amg8CAB1k14Wgkd88MRe6oWvNK6p6mVzQfmXMEg/viewform"
             target="_blank" rel="noreferrer" style={{ color: C.amber }}>Report a problem</a> ·{" "}
          <a href="https://wheretheiss.at" target="_blank" rel="noreferrer" style={{ color: C.dim }}>wheretheiss.at</a> ·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: C.dim }}>© OpenStreetMap</a> ·{" "}
          <a href="https://www.esri.com/en-us/legal/terms/data-attributions" target="_blank" rel="noreferrer" style={{ color: C.dim }}>Esri</a> ·{" "}
          <a href="https://www.openseamap.org" target="_blank" rel="noreferrer" style={{ color: C.dim }}>OpenSeaMap</a>
        </span>
        <span>PUBLIC FEEDS ONLY · © 2026 STREETWATCH · v1.0</span>
      </footer>
    </div>
  );
}


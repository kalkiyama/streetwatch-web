// StreetWatch — main shell. Views live in ./components, data in catalog.json.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, MapPin, X, Globe, ExternalLink, SignalHigh, Star, Navigation, Plane, Share2, HelpCircle, Sparkles } from "lucide-react";
import Intro from "./components/Intro.jsx";
// Catalog is fetched at runtime from /catalog.json (5,000+ feeds — too big to bundle).
import { C, LAYERS, layerKeys, resolveUrl, openLive } from "./theme.js";
import { distKm } from "./geo.js";
import { AIS_BACKEND_URL } from "./config.js";
import WorldMap from "./components/WorldMap.jsx";
import MapPanel from "./components/MapPanel.jsx";
import NearbyCams from "./components/NearbyCams.jsx";
import { useClock, LiveViewport, DataPreview } from "./components/FeedViewer.jsx";
import AviationRadar from "./components/AviationRadar.jsx";
import { norm, fuzzyHit, budgetFor, words } from "./search.js";
import MarineRadar from "./components/MarineRadar.jsx";
import EarthView from "./components/EarthView.jsx";
import SpaceView from "./components/SpaceView.jsx";
import DroneSweep from "./components/DroneSweep.jsx";

const timeAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}min ago`;
  return `${Math.round(m / 60)}h ago`;
};

export default function StreetWatch() {
  // User-adjustable list width (desktop). A visible drag divider replaces the earlier native
  // CSS resize handle, which was a near-invisible corner nub nobody could find.
  const [listW, setListW] = useState(320);
  const [isDesktop, setIsDesktop] = useState(false);
  const draggingRef = React.useRef(false);
  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    const apply = () => setIsDesktop(!!(mq && mq.matches));
    apply();
    if (mq && mq.addEventListener) { mq.addEventListener("change", apply); }
    const move = (e) => {
      if (!draggingRef.current) return;
      const max = Math.round(window.innerWidth * 0.48);
      setListW(Math.min(Math.max(e.clientX, 280), max));
    };
    const up = () => { draggingRef.current = false; document.body.style.userSelect = ""; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      if (mq && mq.removeEventListener) mq.removeEventListener("change", apply);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
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
  useEffect(() => {
    if (deepLinked.current || !CATALOG.length || typeof window === "undefined") return;
    deepLinked.current = true;
    const want = new URLSearchParams(window.location.search).get("feed");
    if (want && CATALOG.some((c) => c.id === want)) {
      setSelectedId(want);
      const f = CATALOG.find((c) => c.id === want);
      // route to the tab this feed belongs to — a shared webcam link must not strand the
      // recipient on the drone view, and a shared UAV link must not strand them on world
      setTab(f && f.tag === "uav" ? "drones" : "world");
    }
  }, [CATALOG]);
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(() => {
    try { return localStorage.getItem("sw-browse") === "map" ? "map" : "list"; } catch { return "list"; }
  });
  const setBrowseMode = (m) => { setBrowse(m); try { localStorage.setItem("sw-browse", m); } catch { /* private mode */ } };
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
    if (!feed) return;
    setPendingSel(d.id);
    // carry enough context for the radar to explain itself if the aircraft has since left
    setPendingSelInfo({
      label: d.callsign || d.id.toUpperCase(),
      seen: d.lastSeen ? timeAgo(d.lastSeen) : null,
    });
    setViewRadius(250);
    setSelectedId(feed.id);
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
    if (typeof window !== "undefined" && window.innerWidth < 1024 && viewerRef.current) {
      viewerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);

  useEffect(() => {
    try { const v = localStorage.getItem("favorites"); if (v) setFavorites(JSON.parse(v)); } catch {}
  }, []);
  const isFav = (id) => favorites.includes(id);
  const toggleFav = (id) => setFavorites((f) => {
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    try { localStorage.setItem("favorites", JSON.stringify(next)); } catch {}
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

  const results = search.list;

  const selected =
    (selectedId === "ME-AV" && userLoc && { id: "ME-AV", name: "Radar over my location", layer: "aviation", city: "Your location", region: "—", country: "", continent: "", src: "ADS-B live", url: "https://globe.adsbexchange.com/", lat: userLoc.lat, lng: userLoc.lng }) ||
    (selectedId === "ME-MR" && userLoc && { id: "ME-MR", name: "Ships near my location", layer: "marine", city: "Your location", region: "—", country: "", continent: "", src: "AIS live", url: "https://www.marinetraffic.com/", lat: userLoc.lat, lng: userLoc.lng }) ||
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
          <div className="font-mono" style={{ fontSize: 10, color: C.faint }}>{c.city} · {c.country}{c.distKm != null ? ` · ${Math.round(c.distKm).toLocaleString()} km` : ""}</div>
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
      <header className="flex items-center justify-between px-4 md:px-6 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
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
        <nav className="flex items-center gap-1">
          <button onClick={() => setIntroOpen(true)} aria-label="What is StreetWatch? Open the guide"
            title="What is this? How do I use it?"
            className="flex items-center justify-center rounded"
            style={{ width: 30, height: 30, color: C.dim, background: "transparent", border: `1px solid ${C.line}` }}>
            <HelpCircle size={15} />
          </button>
          {/* Primary mode switch. Grouped in one pill with a shared border so it reads as a
              two-way toggle — the single most important control for a first-time visitor, who
              otherwise cannot tell the world browser from the drone watch. */}
          <div className="flex items-center rounded-lg" style={{ border: `1px solid ${C.line}`, padding: 2, background: C.panel2 }}>
            {[{ k: "world", label: "World", icon: Globe, hint: "all feeds" },
              { k: "drones", label: "Drones", icon: Plane, hint: "military watch" }].map((t) => (
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

      <div className="flex flex-col lg:flex-row" style={{ minHeight: "calc(100vh - 58px)" }}>
        {/* resize: horizontal gives desktop users a native drag handle (bottom-right corner
            of the panel) to widen or narrow the list — no JS, no library, remembered nowhere
            on purpose (refresh restores the default). Phones keep the stacked layout. */}
        <aside className="w-full flex-shrink-0"
          style={{ background: C.panel, width: isDesktop ? listW : undefined }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
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
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>PUBLIC LAYERS</div>
            <div className="flex flex-wrap gap-1.5">
              {layerKeys.map((k) => {
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
            <div className="font-mono mt-3 mb-1.5" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>REGION</div>
            <div className="flex flex-wrap gap-1.5 pb-1">
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
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full mt-2 px-2.5 rounded font-mono"
              style={{ height: 34, fontSize: 12, color: C.text, background: C.ink, border: `1px solid ${C.line}` }}>
              {countries.map((cn) => <option key={cn} value={cn} style={{ background: C.panel }}>{cn === "All" ? "All countries" : cn}</option>)}
            </select>
            {(continent !== "All" || country !== "All") && (
              <button onClick={() => { setContinent("All"); setCountry("All"); }}
                className="mt-2 font-mono flex items-center gap-1" style={{ fontSize: 10, color: C.faint }}>
                <X size={11} /> clear region
              </button>
            )}
            <div className="flex gap-1.5 mt-3">
              <button onClick={() => setFavOnly((v) => !v)} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: favOnly ? C.ink : C.dim, background: favOnly ? C.amber : C.panel2, border: `1px solid ${favOnly ? C.amber : C.line}` }}>
                <Star size={12} fill={favOnly ? C.ink : "none"} /> Favorites
              </button>
              <button onClick={() => (nearMe ? setNearMe(false) : locateMe())} className="flex items-center gap-1 px-2.5 py-1 rounded font-mono"
                style={{ fontSize: 11, color: nearMe ? C.ink : C.dim, background: nearMe ? C.cyan : C.panel2, border: `1px solid ${nearMe ? C.cyan : C.line}` }}>
                <Navigation size={12} /> Near me
              </button>
            </div>
            {nearMe && !geoErr && (
              <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
                sorted by distance from you · map centred on you · nearest feed opened
                {selected ? ` (${selected.name}${userLoc ? `, ${Math.round(distKm(userLoc.lat, userLoc.lng, selected.lat, selected.lng))}km` : ""})` : ""}
                 · layer chips still filter
              </div>
            )}
            {search.fuzzy > 0 && (
              <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>
                few exact matches — showing {search.fuzzy} close spelling{search.fuzzy === 1 ? "" : "s"} too
              </div>
            )}
            <div className="flex items-center gap-1 mt-2">
              {[["list", "LIST"], ["map", "MAP"]].map(([m, label]) => (
                <button key={m} onClick={() => setBrowseMode(m)}
                  className="px-2.5 py-1 rounded font-mono"
                  style={{ fontSize: 10, letterSpacing: 0.5,
                    color: browse === m ? C.ink : C.dim,
                    background: browse === m ? C.cyan : C.panel2,
                    border: `1px solid ${browse === m ? C.cyan : C.line}` }}>
                  {label}
                </button>
              ))}
              <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>
                {browse === "map" ? "tap a cluster to zoom in" : `${results.length.toLocaleString()} feeds`}
              </span>
            </div>
            {geoErr === "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: C.faint }}>locating…</div>}
            {geoErr && geoErr !== "locating" && <div className="mt-1.5 font-mono" style={{ fontSize: 10, color: "#F0553B" }}>{geoErr}</div>}
          </div>

          {browse === "map" && (
            <div className="mx-4 mb-3">
              <MapPanel feeds={results} selectedId={selected ? selected.id : null}
                userLoc={nearMe ? userLoc : null} tab={tab}
                onSelect={setSelectedId} onOpenSighting={openSighting} onOpenVessel={openVessel} />
            </div>
          )}

          <div style={{ maxHeight: "46vh", overflowY: "auto", display: browse === "map" ? "none" : undefined }} className="lg:max-h-none">
            {tab === "drones" && <DroneSweep onOpen={openSighting} onOpenVessel={openVesselFromList} />}
            {tab === "drones" && (
              <div className="mx-4 mt-2 mb-1 rounded px-3 py-2" style={{ background: "rgba(192,132,252,0.10)", border: "1px solid rgba(192,132,252,0.35)", fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                <b style={{ color: "#C084FC" }}>◇ UAV WATCH</b> — radars over airspaces where category-B6 drones actually fly.
                Sightings are sporadic; an empty radar is honest. Use 250nm range.
              </div>
            )}
            <div className="px-4 py-2 font-mono flex items-center justify-between" style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>
              <span>{results.length} FEEDS</span><span>{nearList ? "NEAREST FIRST" : grouped.length + " REGIONS"}</span>
            </div>
            {results.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ color: C.dim, fontSize: 13 }}>
                {favOnly ? "No favorites yet — tap the ☆ on any feed to save it." : "No feeds match. Try “Asia”, “Tokyo”, or enable more layers."}
              </div>
            )}
            {nearList
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
              })}
          </div>
        </aside>
        {/* the divider itself: a grabbable strip, desktop only */}
        <div className="hidden lg:block flex-shrink-0" role="separator" aria-orientation="vertical"
          title="Drag to resize the list"
          onPointerDown={() => { draggingRef.current = true; document.body.style.userSelect = "none"; }}
          style={{ width: 7, cursor: "col-resize", background: C.line, opacity: 0.6 }} />

        <main className="flex-1 p-4 md:p-6 flex flex-col gap-4">
          <section ref={viewerRef} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, height: 300, flexShrink: 0, scrollMarginTop: 8 }}>
            <WorldMap feeds={results.length > 2000 ? results.filter((c) => c.major || c.tag === "uav" || !["aviation", "marine"].includes(c.layer)) : results} selectedId={selected.id} onSelect={setSelectedId} showIss={tab !== "drones"} />
          </section>

          <section className="flex flex-col md:flex-row gap-4">
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
              Every layer draws only on feeds published for public viewing — official traffic authorities, open ADS-B & AIS
              networks, government/space-agency imagery, and public webcam directories. Clicking any feed hands off to the
              source's own live page in the browser, so there's no cross-origin or RTSP barrier. Private cameras of private
              spaces (homes, shop interiors, anything reachable only because it's unsecured) are deliberately excluded — viewing
              those is unauthorized access, not public data.
            </p>
          </section>
        </main>
      </div>
      <footer className="px-4 md:px-6 py-2.5 font-mono flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
        style={{ borderTop: `1px solid ${C.line}`, fontSize: 9.5, color: C.faint, letterSpacing: 0.4 }}>
        <span>
          DATA&nbsp;
          <a href="https://airplanes.live" target="_blank" rel="noreferrer" style={{ color: C.dim }}>airplanes.live</a> ·{" "}
          <a href="https://aisstream.io" target="_blank" rel="noreferrer" style={{ color: C.dim }}>aisstream.io</a> ·{" "}
          <a href="https://www.digitraffic.fi" target="_blank" rel="noreferrer" style={{ color: C.dim }}>Fintraffic</a> ·{" "}
          <a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noreferrer" style={{ color: C.dim }}>NASA</a> ·{" "}
          <a href="https://wheretheiss.at" target="_blank" rel="noreferrer" style={{ color: C.dim }}>wheretheiss.at</a> ·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: C.dim }}>© OpenStreetMap</a> ·{" "}
          <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" style={{ color: C.dim }}>© CARTO</a>
        </span>
        <span>PUBLIC FEEDS ONLY · © 2026 STREETWATCH · v1.0</span>
      </footer>
    </div>
  );
}


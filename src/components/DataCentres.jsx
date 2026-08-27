import { useEffect, useMemo, useRef, useState } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Server, X } from "lucide-react";
import { C, addBaseTiles } from "../theme.js";
import { guardTouchScroll } from "./mapTouch.js";
import { BACKEND_URL } from "../config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Where the internet physically is.
//
// NOTHING IS MERGED. The same building can appear more than once — PeeringDB and OpenStreetMap
// name it differently and place it a few metres apart — and both records are kept. Deciding they
// are "the same" would throw away the fact that two independent sources disagree, and that
// disagreement is information. Three pins close together tell a reader more than one pin that
// quietly picked a winner, so every record carries the source it came from.
//
// WHAT IS NOT HERE, and why. Capacity in megawatts, water consumption and power sourcing are the
// questions worth asking of a data centre, and almost nobody publishes them per site. They are
// absent rather than estimated. A map that says "capacity unknown" for most sites is more useful
// than one that guesses, and nobody else is doing the former.
// ─────────────────────────────────────────────────────────────────────────────

const OPERATOR_COLOUR = "#22D3EE";

// THERE IS NO LIVE SATELLITE BASEMAP, and it is worth being plain about that. Every world imagery
// layer is a composite stitched from acquisitions months or years apart — the visible seams are
// where one capture meets another. So the map cannot carry a single date. What it CAN do is report
// the acquisition date of the specific tile under a selected building, which Esri publishes, and
// which for Equinix Ashburn reads 26 February 2025 at 0.3m from Virginia's state ortho programme.
const BASEMAPS = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, Maxar, Earthstar Geographics",
    max: 19,
  },
  street: {
    label: "Street",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: "OpenStreetMap contributors, CARTO",
    max: 20,
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "OpenTopoMap, OpenStreetMap contributors",
    max: 17,
  },
};

const ESRI_META = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify";

export default function DataCentres() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [country, setCountry] = useState("All");
  const [region, setRegion] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  // TWO separate switchers, because they answer different questions.
  //   basemap = what the ground looks like. Aerial imagery matters here in a way it does not on
  //     the other tabs: a data centre is a large building with visible cooling plant and
  //     substations, and the street map shows none of that.
  //   source  = WHICH records are shown. Kept separate from the basemap because comparing what
  //     PeeringDB lists against what OpenStreetMap maps is the point of never merging them.
  const [basemap, setBasemap] = useState("satellite");
  const [srcFilter, setSrcFilter] = useState("All");
  // Per-facility imagery date, fetched on selection. Esri publishes acquisition metadata per tile,
  // so a specific building can be dated honestly even though the basemap as a whole cannot.
  const [imagery, setImagery] = useState(null);

  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/api/datacentres`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { if (alive) { setData(j); setState("ok"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);

  const records = (data && data.records) || [];

  const sources = useMemo(() => {
    const c = {};
    records.forEach((r) => { if (r.src) c[r.src] = (c[r.src] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [records]);

  const countries = useMemo(() => {
    const c = {};
    records.forEach((r) => { if (r.country) c[r.country] = (c[r.country] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [records]);

  const regions = useMemo(() => {
    const c = {};
    records.forEach((r) => {
      if (country !== "All" && r.country !== country) return;
      if (r.state) c[r.state] = (c[r.state] || 0) + 1;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [records, country]);

  // A record without a state is NOT hidden when a state filter is off — but it cannot match one
  // when a state is chosen, and 31% of records have no state at all. The count beneath the map
  // says how many are shown of how many exist, so a thin result reads as the data being thin
  // rather than as a filter that broke.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter((r) => {
      if (srcFilter !== "All" && r.src !== srcFilter) return false;
      if (country !== "All" && r.country !== country) return false;
      if (region !== "All" && r.state !== region) return false;
      if (needle) {
        const hay = `${r.name || ""} ${r.operator || ""} ${r.city || ""} ${r.address || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [records, country, region, q, srcFilter]);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = Leaflet.map(elRef.current, {
      center: [30, 0], zoom: 2, scrollWheelZoom: false, worldCopyJump: true,
      // Right-hand side: the left corner is where every other map on the web puts it, and on this
      // tab it sat over the densest part of the world map — the North Atlantic and western Europe.
      zoomControl: false,
    });
    Leaflet.control.zoom({ position: "topright" }).addTo(map);
    // addBaseTiles takes (Leaflet, map) — passing only the map called Leaflet.tileLayer on the map
    // object, which has no such method. guardTouchScroll takes the map alone.
    guardTouchScroll(map);
    mapRef.current = map;
    layerRef.current = Leaflet.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // The tile layer is REPLACED rather than toggled, so only one is ever fetching. Leaving the
  // previous layer attached would keep it downloading tiles behind the visible one.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) { map.removeLayer(tileRef.current); tileRef.current = null; }
    const b = BASEMAPS[basemap];
    tileRef.current = Leaflet.tileLayer(b.url, { attribution: b.attr, maxZoom: b.max }).addTo(map);
    tileRef.current.bringToBack();
  }, [basemap]);

  // Imagery acquisition date for the SELECTED facility. Esri answers this without a key, per tile,
  // so the claim is about that specific building rather than the basemap as a whole.
  useEffect(() => {
    if (!sel) { setImagery(null); return; }
    let alive = true;
    const geom = encodeURIComponent(JSON.stringify({ x: sel.lon, y: sel.lat, spatialReference: { wkid: 4326 } }));
    const ext = `${sel.lon - 0.05},${sel.lat - 0.05},${sel.lon + 0.05},${sel.lat + 0.05}`;
    fetch(`${ESRI_META}?geometry=${geom}&geometryType=esriGeometryPoint&tolerance=2`
        + `&mapExtent=${ext}&imageDisplay=600,400,96&returnGeometry=false&f=json`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const a = (j.results && j.results[0] && j.results[0].attributes) || null;
        setImagery(a ? {
          date: a["SRC_DATE2"] || null,
          res: a["RESOLUTION (M)"] || null,
          source: a.SOURCE || null,
          desc: a.DESCRIPTION || null,
        } : null);
      })
      .catch(() => { if (alive) setImagery(null); });
    return () => { alive = false; };
  }, [sel]);

  useEffect(() => {
    const map = mapRef.current, lg = layerRef.current;
    if (!map || !lg) return;
    lg.clearLayers();

    // Marker size carries the network count where PeeringDB reports one (79% of records). A site
    // with two hundred networks present is a different kind of place from a single-tenant room,
    // and that number is reported by the operator rather than inferred from anything.
    shown.forEach((r, i) => {
      const n = Number.isFinite(r.networks) ? r.networks : 0;
      const radius = n > 100 ? 7 : n > 25 ? 5.5 : n > 5 ? 4 : 3;
      Leaflet.circleMarker([r.lat, r.lon], {
        radius, color: OPERATOR_COLOUR, weight: 1.2, opacity: 0.9,
        fillColor: OPERATOR_COLOUR, fillOpacity: 0.35,
      })
        .on("click", () => setSel(r))
        .bindTooltip(`${r.name || "unnamed"}${r.operator ? " · " + r.operator : ""}`,
          { direction: "top", opacity: 0.9 })
        .addTo(lg);
    });
  }, [shown]);

  const fmtUnknown = (v) => (v == null || v === "" ? <span style={{ color: C.faint }}>unknown</span> : v);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-1.5 flex-wrap font-mono" style={{ fontSize: 9 }}>
        <span style={{ color: C.faint, letterSpacing: 1, marginRight: 2 }}>COUNTRY</span>
        <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion("All"); }}
          className="px-2 rounded font-mono"
          style={{ fontSize: 10, height: 26, color: C.dim, background: C.ink, border: `1px solid ${C.line}` }}>
          <option value="All" style={{ background: C.panel }}>All countries ({records.length.toLocaleString()})</option>
          {countries.map(([cn, n]) => (
            <option key={cn} value={cn} style={{ background: C.panel }}>{cn} ({n})</option>
          ))}
        </select>
        {regions.length > 0 && (
          <select value={region} onChange={(e) => setRegion(e.target.value)}
            className="px-2 rounded font-mono"
            style={{ fontSize: 10, height: 26, color: C.dim, background: C.ink, border: `1px solid ${C.line}` }}>
            <option value="All" style={{ background: C.panel }}>All states / regions</option>
            {regions.map(([rn, n]) => (
              <option key={rn} value={rn} style={{ background: C.panel }}>{rn} ({n})</option>
            ))}
          </select>
        )}
        {/* SOURCE. Only shown once more than one source is in the file — with PeeringDB alone a
            filter offering a single choice is noise. It appears when the OSM records land. */}
        {sources.length > 1 && (
          <select value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)}
            className="px-2 rounded font-mono"
            style={{ fontSize: 10, height: 26, color: C.dim, background: C.ink, border: `1px solid ${C.line}` }}>
            <option value="All" style={{ background: C.panel }}>All sources</option>
            {sources.map(([sn, n]) => (
              <option key={sn} value={sn} style={{ background: C.panel }}>{sn} ({n})</option>
            ))}
          </select>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="operator, name or city"
          className="px-2 rounded font-mono"
          style={{ fontSize: 10, height: 26, width: 190, color: C.dim, background: C.ink, border: `1px solid ${C.line}` }} />
      </div>

      <div className="flex items-center justify-center gap-1 font-mono">
        {Object.entries(BASEMAPS).map(([k, b]) => (
          <button key={k} onClick={() => setBasemap(k)} className="rounded"
            style={{ fontSize: 8.5, padding: "3px 8px",
              color: basemap === k ? "#04121F" : C.dim,
              background: basemap === k ? C.dim : "transparent",
              border: `1px solid ${C.line}` }}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="relative w-full rounded-lg overflow-hidden"
        style={{ border: `1px solid ${C.line}`, aspectRatio: "16 / 10" }}>
        <div ref={elRef} className="absolute inset-0" />
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center font-mono"
            style={{ fontSize: 10, color: C.faint, background: C.panel }}>loading facilities…</div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center font-mono"
            style={{ fontSize: 10, color: C.amber, background: C.panel }}>facility list unavailable</div>
        )}
      </div>

      {sel && (
        <div className="font-mono rounded-lg" style={{ padding: "10px 12px",
          background: "rgba(4,18,31,0.95)", border: `1px solid ${OPERATOR_COLOUR}66` }}>
          <div className="flex items-start justify-between gap-2">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: OPERATOR_COLOUR }}>{sel.name || "unnamed facility"}</div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2 }}>{sel.operator}</div>
            </div>
            <button onClick={() => setSel(null)} aria-label="Close" style={{ color: C.dim }}><X size={14} /></button>
          </div>

          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 7, lineHeight: 1.5 }}>
            {[sel.address, sel.city, sel.state, sel.country].filter(Boolean).join(" · ")}
            <br />
            {sel.lat.toFixed(4)}, {sel.lon.toFixed(4)}
          </div>

          {/* The interesting questions, and mostly unanswerable from open sources. Shown as
              "unknown" rather than omitted, because an absent row reads as a field that does not
              exist while an explicit unknown reads as a fact nobody publishes. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: 10, marginTop: 8 }}>
            <div><span style={{ color: C.faint }}>capacity </span>{fmtUnknown(null)}</div>
            <div><span style={{ color: C.faint }}>water use </span>{fmtUnknown(null)}</div>
            <div><span style={{ color: C.faint }}>power supply </span>{fmtUnknown(sel.voltage ? sel.voltage.join(", ") : null)}</div>
            <div><span style={{ color: C.faint }}>substations </span>{fmtUnknown(sel.substations)}</div>
            <div><span style={{ color: C.faint }}>networks present </span>{fmtUnknown(sel.networks)}</div>
            <div><span style={{ color: C.faint }}>source </span>{sel.src}</div>
          </div>

          {imagery && imagery.date && (
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 6 }}>
              Imagery of this spot captured {imagery.date}
              {imagery.res ? ` · ${Number(imagery.res).toFixed(2)}m` : ""}
              {imagery.source ? ` · ${imagery.source}` : ""}
              {imagery.desc ? ` (${imagery.desc})` : ""}
            </div>
          )}
          <div style={{ fontSize: 9, color: C.faint, marginTop: 8, lineHeight: 1.45 }}>
            Capacity, water use and power sourcing are not published per site by most operators.
            They are left unknown here rather than estimated.{" "}
            <a href={sel.ref} target="_blank" rel="noreferrer" style={{ color: OPERATOR_COLOUR }}>source record ↗</a>
            {sel.url && <> · <a href={sel.url} target="_blank" rel="noreferrer" style={{ color: OPERATOR_COLOUR }}>operator site ↗</a></>}
          </div>
        </div>
      )}

      <div className="font-mono" style={{ fontSize: 9, color: C.faint, lineHeight: 1.5 }}>
        {shown.length.toLocaleString()} of {records.length.toLocaleString()} facilities shown
        {data && data.built ? ` · list built ${data.built.slice(0, 10)}` : ""}
        {" · "}larger circles carry more networks.{" "}
        {/* Saying what a dataset MISSES matters more here than usual: PeeringDB lists facilities
            that sell interconnection, so the hyperscalers who build their own are largely absent.
            Someone reading this map without that caveat would conclude Amazon has no data centres. */}
        This list comes from PeeringDB, where operators maintain their own entries — so it covers
        colocation and carrier sites well, and largely omits the campuses hyperscalers build for
        themselves. Records are never merged: one site may appear more than once under different
        names, and each keeps its own source.
      </div>
    </div>
  );
}

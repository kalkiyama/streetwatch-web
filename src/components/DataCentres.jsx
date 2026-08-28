import { useEffect, useMemo, useRef, useState } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Server, X } from "lucide-react";
import { C, addBaseTiles } from "../theme.js";
import { guardTouchScroll } from "./mapTouch.js";
import { BACKEND_URL } from "../config.js";
import { countryName, subdivisionName } from "../placeNames.js";

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
  // The count and the marker key stay visible; the coverage caveat moves behind a toggle. It is
  // still the most important thing on the panel — without it someone concludes Amazon has no data
  // centres — but it is worth reading once, not on every visit under every map.
  const [whyList, setWhyList] = useState(false);

  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);
  const panelRef = useRef(null);
  const refRef = useRef(null);

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
    // Sorted by the NAME shown, not the code stored — otherwise "Germany" sorts under D and
    // "United Kingdom" under G, which is exactly the confusion the names are meant to remove.
    return Object.entries(c).sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
  }, [records]);

  const regions = useMemo(() => {
    const c = {};
    records.forEach((r) => {
      if (country !== "All" && r.country !== country) return;
      // Keyed by the DISPLAYED name, not the stored value. PeeringDB's state field is freeform:
      // six US records write "New York" where the rest write "NY", so keying by the raw value put
      // the same state in the dropdown twice — once with 81 facilities and once with 1. A filter
      // that lists a place twice makes a reader doubt everything else on the page.
      if (r.state) {
        const label = subdivisionName(r.country, r.state);
        c[label] = (c[label] || 0) + 1;
      }
    });
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]));
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
      // Compared on the displayed name too, so a record storing "NY" and one storing "New York"
      // both match the single "New York" option.
      if (region !== "All" && subdivisionName(r.country, r.state) !== region) return false;
      if (needle) {
        // The country and state NAMES are searchable too. Someone typing "Germany" or "Maryland"
        // should find them; matching only the stored codes would mean the search understood less
        // than the dropdown beside it displays.
        // toLowerCase() must wrap BOTH literals. With the call on the second only it lowercased
        // the country and state and nothing else — so "germany" matched while "equinix" did not.
        const hay = (`${r.name || ""} ${r.operator || ""} ${r.city || ""} ${r.address || ""} `
          + `${countryName(r.country) || ""} ${subdivisionName(r.country, r.state) || ""}`).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [records, country, region, q, srcFilter]);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = Leaflet.map(elRef.current, {
      center: [30, 0], zoom: 2, scrollWheelZoom: false, worldCopyJump: true,
      // Bounded, so the map cannot be dragged off the world. Without this a stray drag lands on
      // blank white with no landmark to navigate back by — the map looks broken, and a new visitor
      // has no way to know it is simply pointed at nothing.
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      minZoom: 2,
      // Right-hand side: the left corner is where every other map on the web puts it, and on this
      // tab it sat over the densest part of the world map — the North Atlantic and western Europe.
      zoomControl: false,
    });
    // Vertically centred on the right edge, matching the Space and Cyber globes. Leaflet only
    // offers the four corners, so the container is nudged with CSS after it is created.
    const zc = Leaflet.control.zoom({ position: "topright" }).addTo(map);
    // Nudged down the right edge with a margin rather than absolute positioning: taking it out of
    // Leaflet's own corner layout pushed it outside the container, so the + button sat off screen
    // and only - was reachable.
    const zel = zc.getContainer();
    zel.style.marginTop = "38%";
    zel.style.marginRight = "10px";
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
    // BORDERS AND PLACE NAMES over the imagery. Satellite tiles carry none, so a dot in the Sahel
    // or central Asia sits in an unlabelled expanse — the reader can see a building but not which
    // country it is in, which is most of what they came to find out.
    if (refRef.current) { map.removeLayer(refRef.current); refRef.current = null; }
    if (basemap !== "street") {
      refRef.current = Leaflet.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: b.max, pane: "shadowPane", opacity: 0.9 }
      ).addTo(map);
    }
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
    const bounds = [];
    shown.forEach((r, i) => {
      const n = Number.isFinite(r.networks) ? r.networks : 0;
      const radius = n > 100 ? 7 : n > 25 ? 5.5 : n > 5 ? 4 : 3;
      bounds.push([r.lat, r.lon]);
      Leaflet.circleMarker([r.lat, r.lon], {
        // A dark outline and solid fill, so the dot reads on a pale Terrain basemap as well as on
        // dark imagery. Cyan at 35% opacity vanished against anything light.
        radius, color: "#04121F", weight: 1.6, opacity: 0.9,
        fillColor: OPERATOR_COLOUR, fillOpacity: 0.95,
      })
        .on("click", () => {
          setSel(r);
          // Scroll the panel INTO VIEW. It renders below the map, so on a laptop a click looked
          // like it did nothing at all — the answer was off the bottom of the screen.
          setTimeout(() => {
            const el = panelRef.current;
            if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 60);
        })
        .bindTooltip(`${r.name || "unnamed"}${r.operator ? " · " + r.operator : ""}`,
          { direction: "top", opacity: 0.9 })
        .addTo(lg);
    });
    // FIT THE VIEW to what the filter left. Searching "Germany" while looking at Maryland filtered
    // correctly and left the map where it was, so the search appeared not to work — the results
    // were off screen. Only on a real narrowing: refitting on every keystroke would fight anyone
    // panning around while they type.
    if (bounds.length && bounds.length < records.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11, animate: true });
    }
  }, [shown, records.length]);

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
            <option key={cn} value={cn} style={{ background: C.panel }}>{countryName(cn)} ({n})</option>
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

      {/* A fixed height, not an aspect ratio. 16:10 left dead space above and below on a narrow
          screen, because the Leaflet container does not stretch to fill a shape it was not given. */}
      <div className="relative w-full rounded-lg overflow-hidden"
        style={{ border: `1px solid ${C.line}`, height: "min(70vh, 560px)" }}>
        <div ref={elRef} className="absolute inset-0" />
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center font-mono"
            style={{ fontSize: 10, color: C.faint, background: C.panel }}>loading facilities…</div>
        )}
        {/* AN EMPTY RESULT HAS TO SAY WHY. Searching "Germany" while Utah was still selected
            returned nothing and left a blank map — the filters had combined exactly as asked, but
            silence reads as a broken search rather than as an honest zero. Naming the active
            filters shows what is excluding things, and the button removes them. */}
        {state === "ok" && shown.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-mono px-6 text-center"
            style={{ background: "rgba(4,18,31,0.86)" }}>
            <div style={{ fontSize: 12, color: C.amber }}>Nothing matches all of these at once</div>
            <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.6 }}>
              {[country !== "All" && countryName(country),
                region !== "All" && subdivisionName(country, region),
                srcFilter !== "All" && srcFilter,
                q.trim() && `"${q.trim()}"`].filter(Boolean).join("  +  ")}
            </div>
            <button onClick={() => { setCountry("All"); setRegion("All"); setSrcFilter("All"); }}
              className="rounded font-mono" style={{ fontSize: 10, padding: "4px 10px", marginTop: 2,
                color: "#04121F", background: C.cyan }}>
              Clear the filters, keep the search
            </button>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center font-mono"
            style={{ fontSize: 10, color: C.amber, background: C.panel }}>facility list unavailable</div>
        )}
      </div>

      {sel && (
        <div ref={panelRef} className="font-mono rounded-lg" style={{ padding: "10px 12px",
          background: "rgba(4,18,31,0.95)", border: `1px solid ${OPERATOR_COLOUR}66` }}>
          <div className="flex items-start justify-between gap-2">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: OPERATOR_COLOUR }}>{sel.name || "unnamed facility"}</div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2 }}>{sel.operator}</div>
            </div>
            <button onClick={() => setSel(null)} aria-label="Close" style={{ color: C.dim }}><X size={14} /></button>
          </div>

          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 7, lineHeight: 1.5 }}>
            {[sel.address, sel.city, subdivisionName(sel.country, sel.state), countryName(sel.country)]
              .filter(Boolean).join(" · ")}
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
            {/* A BOOLEAN, not a count — PeeringDB's diverse_serving_substations means "fed by more
                than one substation", which is a resilience property. Rendered raw it showed nothing
                at all, because React does not print booleans: an empty gap where the whole point of
                this panel is that unknown says so. */}
            <div><span style={{ color: C.faint }}>power feeds </span>
              {sel.substations === true ? "more than one substation"
                : sel.substations === false ? "single substation"
                : fmtUnknown(null)}</div>
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
        <button onClick={() => setWhyList((v) => !v)} className="rounded"
          style={{ fontSize: 9, padding: "0 5px", marginLeft: 2, color: C.cyan,
            background: "rgba(34,211,238,0.10)", border: `1px solid ${C.cyan}66`, whiteSpace: "nowrap" }}>
          {whyList ? "Less" : "Why?"}
        </button>{" "}
        {whyList && (<>
        {/* Saying what a dataset MISSES matters more here than usual: PeeringDB lists facilities
            that sell interconnection, so the hyperscalers who build their own are largely absent.
            Someone reading this map without that caveat would conclude Amazon has no data centres. */}
        This list comes from PeeringDB, where operators maintain their own entries — so it covers
        colocation and carrier sites well, and largely omits the campuses hyperscalers build for
        themselves. Records are never merged: one site may appear more than once under different
        names, and each keeps its own source.
        </>)}
      </div>
    </div>
  );
}

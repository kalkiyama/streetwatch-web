import { useEffect, useRef, useState, lazy, Suspense } from "react";
import Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Shield, AlertTriangle, Bug, Info } from "lucide-react";
import { C, fmtTs, addBaseTiles } from "../theme.js";
import { guardTouchScroll } from "./mapTouch.js";
import { BACKEND_URL } from "../config.js";

// three.js is ~150kB gzipped and already lazily loaded for the Space tab; the same chunk serves
// both, so opening Cyber costs nothing extra for anyone who has visited Space.
const CyberGlobe = lazy(() => import("./CyberGlobe.jsx"));

// Blue Marble as a BACKDROP rather than a subject: dark and cloud-free so the arcs read against
// it. A live true-colour image is mostly white cloud and would swallow them.
const GLOBE_TEXTURE =
  "https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2004-01-01"
  + "&BBOX=-90,-180,90,180&CRS=EPSG:4326&LAYERS=BlueMarble_ShadedRelief_Bathymetry"
  + "&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024";

// CYBER — what is actually happening on the internet right now, without the missile animation.
//
// EVERY WELL-KNOWN CYBER ATTACK MAP DRAWS ARCS BETWEEN COUNTRIES AS MISSILES. Norse (dead since
// 2016), Kaspersky, Fortinet, Check Point. Those maps are marketing, and the arc implies an
// attribution the data does not support.
// Cloudflare DOES publish real origin->target pairs, so the arcs are not fabricated. What is
// fabricated elsewhere is the MEANING:
//   ORIGIN is the country of a geolocated source IP — for a botnet, compromised machines, not the
//     operator.
//   TARGET is the BILLING COUNTRY of the Cloudflare customer attacked, not necessarily where the
//     server sits.
// So "BR -> US 5.7%" means 5.7% of layer-3 attack traffic BY VOLUME came from Brazilian IP space
// against US-billed customers. It does NOT mean Brazil attacked America.
//
// THE PROOF SITS IN THE DATA. US -> US runs around 3.3%, roughly a third of the largest flow —
// compromised machines inside the United States hitting US-billed customers. No missile animation
// can draw that honestly, which is why domestic flows are rendered as a RING on the country rather
// than an arrow. One visual difference does more explaining than a paragraph.
//
// "LAST 24 HOURS", NEVER "LIVE". Measured: the window is hour-aligned and Cloudflare computes it
// ~15 minutes after the window closes. Every competitor implies real-time; this one says what it is.

// Country centroids for the arcs. 26 distinct countries appeared across the top 50 flows when this
// was built, so this covers those plus the obvious neighbours rather than importing a 250-entry
// dependency for a handful of rows.
// A COUNTRY WITHOUT A CENTROID IS NOT DROPPED — it renders in the list and is counted in the note
// under the globe. Silently omitting a flow because we lack its coordinates would understate the
// picture, which is the failure this project keeps finding.
const LL = {
  AE: [24.0, 54.0], AR: [-34.0, -64.0], AT: [47.5, 14.5], AU: [-25.0, 133.0],
  BD: [24.0, 90.0], BE: [50.8, 4.5], BR: [-10.0, -55.0], CA: [56.0, -106.0],
  CH: [46.8, 8.2], CL: [-30.0, -71.0], CN: [35.0, 105.0], CO: [4.0, -72.0],
  CZ: [49.8, 15.5], DE: [51.0, 9.0], DK: [56.0, 10.0], EC: [-1.8, -78.0],
  EG: [26.0, 30.0], ES: [40.0, -4.0], FI: [64.0, 26.0], FR: [46.0, 2.0],
  GB: [54.0, -2.0], HK: [22.3, 114.2], ID: [-5.0, 120.0], IE: [53.0, -8.0],
  IL: [31.5, 34.8], IN: [21.0, 78.0], IR: [32.0, 53.0], IT: [42.8, 12.8],
  JP: [36.0, 138.0], KR: [36.5, 128.0], MX: [23.0, -102.0], MY: [4.2, 102.0],
  NG: [9.1, 8.7], NL: [52.2, 5.3], NO: [61.0, 8.5], NZ: [-41.0, 174.0],
  PH: [12.9, 121.8], PK: [30.4, 69.3], PL: [52.0, 19.0], PT: [39.4, -8.2],
  RO: [45.9, 25.0], RU: [61.5, 100.0], SA: [24.0, 45.0], SE: [62.0, 15.0],
  SG: [1.35, 103.8], TH: [15.9, 101.0], TR: [39.0, 35.0], TW: [23.7, 121.0],
  UA: [48.4, 31.2], US: [39.0, -98.0], VN: [14.1, 108.3], ZA: [-30.6, 22.9],
  // OUTAGES HAPPEN WHERE ATTACK FLOWS DO NOT. The first table covered only the countries seen in
  // the top 50 flows, so clicking a Cuba or Guam outage silently did nothing — indistinguishable
  // from a broken button. These are the places that actually appear in outage annotations:
  // island nations, states with censorship shutdowns, and anywhere with fragile infrastructure.
  AF: [33.9, 67.7], AM: [40.1, 45.0], AO: [-11.2, 17.9], AZ: [40.1, 47.6],
  BJ: [9.3, 2.3], BO: [-16.3, -63.6], BY: [53.7, 27.95], CD: [-4.0, 21.8],
  CG: [-0.2, 15.8], CI: [7.5, -5.5], CM: [7.4, 12.4], CU: [21.5, -77.8],
  DZ: [28.0, 1.7], ET: [9.15, 40.5], GE: [42.3, 43.4], GH: [7.9, -1.0],
  GN: [9.9, -9.7], GU: [13.4, 144.8], HT: [19.0, -72.3], IQ: [33.2, 43.7],
  JM: [18.1, -77.3], JO: [30.6, 36.2], KE: [-0.02, 37.9], KG: [41.2, 74.8],
  KH: [12.6, 104.9], KZ: [48.0, 66.9], LB: [33.9, 35.9], LK: [7.9, 80.8],
  LY: [26.3, 17.2], MA: [31.8, -7.1], MM: [21.9, 95.96], MZ: [-18.7, 35.5],
  NP: [28.4, 84.1], PA: [8.5, -80.8], PE: [-9.2, -75.0], PG: [-6.3, 143.96],
  PR: [18.2, -66.6], PS: [31.95, 35.2], PY: [-23.4, -58.4], SD: [12.9, 30.2],
  SN: [14.5, -14.5], SY: [34.8, 39.0], TJ: [38.9, 71.3], TN: [33.9, 9.5],
  TZ: [-6.4, 34.9], UG: [1.4, 32.3], UZ: [41.4, 64.6], VE: [6.4, -66.6],
  YE: [15.6, 48.5], ZM: [-13.1, 27.85], ZW: [-19.0, 29.15],
};

// A curved path between two points, as a polyline Leaflet can draw. The bow is COSMETIC — it keeps
// overlapping pairs legible and carries no meaning, so it is kept shallow rather than drawn as a
// trajectory. Nothing about this data describes a path through the air.
function arcPoints(a, b, bend = 0.22, steps = 48) {
  const [lat1, lon1] = a, [lat2, lon2] = b;
  // Take the short way round rather than across the whole map when a pair spans the date line.
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const mLat = (lat1 + lat2) / 2 + Math.abs(d) * bend * 0.35;
  const mLon = lon1 + d / 2;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * lat1 + 2 * u * t * mLat + t * t * lat2,
      u * u * lon1 + 2 * u * t * (lon1 + (mLon - lon1)) + t * t * (lon1 + d),
    ]);
  }
  return out;
}

// onReady hands the map UP rather than the parent handing a ref DOWN. Writing mapOut.current from
// inside this component's effect made React Compiler object three times — a child mutating a
// parent's ref during an effect is exactly the pattern it warns about. A callback is the same
// wiring without the violation.
function FlowMap({ flows, selected, onSelect, onReady }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const roRef = useRef(null);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = Leaflet.map(box.current, {
      center: [20, 0], zoom: 1, minZoom: 1, maxZoom: 6,
      zoomControl: false, worldCopyJump: true,
      // The panel scrolls; wheel-zoom here would hijack the page.
      scrollWheelZoom: false, attributionControl: true,
    });
    addBaseTiles(Leaflet, map.current);
    guardTouchScroll(map.current);
    layer.current = Leaflet.layerGroup().addTo(map.current);
    if (onReady) onReady(map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 80);
    // DEF-035: Leaflet caches container size, so on a pane resize its overlay stays clipped to the
    // old viewport and the vectors vanish with no error.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        try { map.current && map.current.invalidateSize(); } catch { /* unmounted */ }
      });
      ro.observe(box.current);
      roRef.current = ro;
    }
    return () => {
      if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, []);

  // FRAME THE FLOW THAT WAS CLICKED. Isolating the arc dimmed the others but left the view
  // wherever it was — often panned to an outage country from an earlier click, so the highlighted
  // arc could be off-screen entirely. Selecting something and not showing it is the same defect as
  // a click that does nothing.
  useEffect(() => {
    if (!map.current || selected == null) return;
    const f = flows[selected];
    if (!f || !f.from) return;
    if (f.domestic || !f.to) map.current.setView(f.from, 3);
    else map.current.fitBounds([f.from, f.to], { padding: [40, 40], maxZoom: 4 });
  }, [selected, flows]);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const max = Math.max(0.01, ...flows.map((f) => f.pct));
    flows.forEach((f, i) => {
      if (!f.from || !f.to) return;
      const on = selected == null || selected === i;
      const t = f.pct / max;
      const col = f.domestic ? "#F6A821" : "#C084FC";
      const label = f.domestic
        ? `${f.originName} → itself · ${f.pct.toFixed(2)}%`
        : `${f.originName} → ${f.targetName} · ${f.pct.toFixed(2)}%`;
      if (f.domestic) {
        // NO DIRECTION, SO NO ARROW. A ring says "this happened here" without implying it came
        // from somewhere else — and roughly a third of the largest flow is this shape.
        Leaflet.circleMarker(f.from, {
          radius: 5 + t * 16, color: col, weight: 1 + t * 1.5, fill: false,
          opacity: on ? 0.45 + t * 0.45 : 0.08,
        }).bindTooltip(label).on("click", () => onSelect(selected === i ? null : i)).addTo(layer.current);
      } else {
        Leaflet.polyline(arcPoints(f.from, f.to), {
          color: col, weight: 1 + t * 3, opacity: on ? 0.35 + t * 0.5 : 0.06,
        }).bindTooltip(label).on("click", () => onSelect(selected === i ? null : i)).addTo(layer.current);
        Leaflet.circleMarker(f.to, {
          radius: 2 + t * 4, color: col, weight: 1, fill: false, opacity: on ? 0.7 : 0.08,
        }).addTo(layer.current);
      }
      Leaflet.circleMarker(f.from, {
        radius: 2.5, color: col, fillColor: col, fillOpacity: on ? 0.9 : 0.1, weight: 0,
      }).addTo(layer.current);
    });
  }, [flows, selected, onSelect]);

  // ASSIGNED IN THE CREATION EFFECT, not a separate one. This used to live in its own effect with
  // [mapOut] as the dependency — which never changes, so it ran ONCE, before the map was created,
  // and mapOut.current stayed null forever. The outage buttons silently did nothing.
  return <div ref={box} style={{ height: 300, background: "#0A0D12" }} />;
}

const Panel = ({ icon: Icon, title, note, children }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 12 }}>
    <div className="px-3 py-2 font-mono flex items-center gap-1.5"
      style={{ fontSize: 10, letterSpacing: 1, color: C.faint, borderBottom: `1px solid ${C.line}` }}>
      <Icon size={11} />{title}
      {note && <span style={{ marginLeft: "auto", letterSpacing: 0, opacity: 0.8 }}>{note}</span>}
    </div>
    {children}
  </div>
);

export default function CyberView() {
  // GLOBE by default. A tester called this tab "very minimal" beside Space and asked for the same
  // globe; the flat map stays because it shows every flow at once, which a sphere cannot — half
  // the planet is always facing away.
  const [view, setView] = useState("globe");
  const [flows, setFlows] = useState(null);
  const [outages, setOutages] = useState(null);
  const [kev, setKev] = useState(null);
  const [err, setErr] = useState(null);
  const [why, setWhy] = useState(false);
  // Which flow is isolated. There is no detail view for a percentage, so a click ISOLATES rather
  // than navigates — the arc stays lit and the rest dim. That is the honest interaction: the data
  // supports "look at this one", not "open this one".
  const [sel, setSel] = useState(null);
  const mapRef = useRef(null);
  const [noPos, setNoPos] = useState(null);   // an outage whose country we cannot place
  const markRef = useRef(null);               // the marker showing WHICH country was clicked

  useEffect(() => {
    let alive = true;
    const get = (path, set) =>
      fetch(`${BACKEND_URL}/api/cyber/${path}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => { if (alive) set(j); })
        .catch((e) => { if (alive) setErr(e.message); });
    get("flows?limit=12", setFlows);
    get("outages?days=7&limit=8", setOutages);
    get("kev?limit=12", setKev);
    // Cloudflare recomputes hourly and the proxy caches for 15 minutes, so polling faster would
    // only re-fetch identical answers.
    const t = setInterval(() => { get("flows?limit=12", setFlows); get("outages?days=7&limit=8", setOutages); }, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // A flow WITHOUT a centroid is not dropped — it keeps its row and is counted in the note under
  // the map. Silently omitting it because we lack coordinates would understate the picture.
  const mapped = (flows?.flows || []).map((f) => ({
    ...f, from: LL[f.origin] || null, to: LL[f.target] || null,
  }));
  const missing = mapped.filter((f) => !f.from || !f.to).length;
  const maxPct = Math.max(0.01, ...mapped.map((f) => f.pct));

  return (
    <div className="px-4 pb-4">
      <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
        Attack traffic, internet outages and vulnerabilities under active exploitation, from public
        sources.{" "}
        <button onClick={() => setWhy((v) => !v)}
          style={{ color: C.dim, background: "none", border: "none", padding: 0,
            textDecoration: "underline", cursor: "pointer", fontSize: 11.5 }}>
          {why ? "less" : "what these arrows mean"}
        </button>
        {why && (
          <span style={{ display: "block", marginTop: 6, fontSize: 11, color: C.faint, lineHeight: 1.55 }}>
            An arrow is <b>not</b> one country attacking another. The origin is the country of a
            geolocated source IP — for a botnet, compromised machines rather than whoever is
            operating them. The target is the <b>billing country</b> of the Cloudflare customer
            attacked, not necessarily where the server sits.
            <span style={{ display: "block", marginTop: 4 }}>
              The clearest example is in the data: US&nbsp;→&nbsp;US is usually among the largest
              flows — machines inside the United States hitting US-billed customers. Those are drawn
              as a ring on the country, because they have no direction.
            </span>
            <span style={{ display: "block", marginTop: 4 }}>
              Figures are a share of attack traffic <b>by volume</b>, so a single large attack can
              dominate. The window is the last 24 hours, recomputed hourly — not live.
            </span>
          </span>
        )}
      </div>

      {err && (
        <div className="px-3 py-2" style={{ fontSize: 11, color: C.amber, background: C.panel2,
          border: `1px solid ${C.line}`, borderRadius: 4, marginBottom: 10 }}>
          Some sources are unavailable right now ({err}). What loaded is shown below.
        </div>
      )}

      <Panel icon={Shield} title="ATTACK FLOWS"
        note={flows?.computedAt ? `last 24h · computed ${fmtTs(flows.computedAt)}` : "loading…"}>
        {/* The aspect ratio is for the GLOBE only. FlowMap sets its own height, so forcing 16:10
            on both left a band of empty background under the flat map. */}
        <div className="relative" style={view === "globe" ? { aspectRatio: "16 / 10" } : undefined}>
          {view === "globe" ? (
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center font-mono"
              style={{ fontSize: 10, color: C.faint }}>loading globe\u2026</div>}>
              <CyberGlobe flows={mapped} coords={LL} selected={sel} onSelect={setSel}
                textureUrl={GLOBE_TEXTURE} />
            </Suspense>
          ) : (
            <FlowMap flows={mapped} selected={sel} onSelect={setSel}
              onReady={(m) => { mapRef.current = m; }} />
          )}
          {/* WHAT AN ARC MEANS, in words. A line between PL and CL says something travelled between
              two two-letter codes: not which countries, and not what the traffic was. Cloudflare
              is measuring HTTP requests its WAF classified as attack traffic, counted by origin
              and target over 24 hours — not intrusions, not breaches, and no attribution to anyone.
              Stating that once beside the selected arc does more than the paragraph below ever did. */}
          {view === "globe" && sel != null && mapped[sel] && (
            <div className="absolute font-mono" style={{ left: 8, right: 8, bottom: 8, zIndex: 500,
              background: "rgba(10,13,18,0.92)", border: `1px solid ${C.line}`,
              borderRadius: 6, padding: "6px 9px" }}>
              <div style={{ fontSize: 11.5, color: "#F6A821" }}>
                {mapped[sel].domestic
                  ? `${mapped[sel].originName} \u2192 itself`
                  : `${mapped[sel].originName} \u2192 ${mapped[sel].targetName}`}
                {" \u00b7 "}{mapped[sel].pct.toFixed(2)}%
              </div>
              <div style={{ fontSize: 9, color: C.faint, marginTop: 2, lineHeight: 1.4 }}>
                share of requests Cloudflare's filters classified as attack traffic, last 24h.
                Not intrusions or breaches, and not attributed to anyone — only where the
                requests came from and went.
              </div>
            </div>
          )}
          <div className="absolute font-mono" style={{ right: 8, top: 8, zIndex: 500, display: "flex", gap: 3 }}>
            {[["globe", "GLOBE"], ["map", "MAP"]].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className="rounded"
                style={{ fontSize: 8.5, padding: "3px 7px",
                  color: view === k ? "#0A0D12" : C.dim,
                  background: view === k ? C.dim : "rgba(10,13,18,0.75)",
                  border: `1px solid ${C.line}` }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.line}` }}>
          {/* CLEAR THE OUTAGE MARKER IN THE CLICK HANDLER, not in the map effect. That effect
              returns early when `selected` is null, so toggling a flow OFF left the outage circle
              on the map with the view somewhere else entirely. Every click passes through here. */}
          {mapped.map((f, i) => (
            <button key={i} onClick={() => {
                if (markRef.current) { markRef.current.remove(); markRef.current = null; }
                setNoPos(null);
                setSel(sel === i ? null : i);
              }}
              className="w-full text-left px-3 py-1.5 font-mono flex items-center gap-2"
              style={{ fontSize: 11, color: C.text, borderBottom: `1px solid ${C.line}`,
                background: sel === i ? C.panel2 : "transparent",
                borderLeft: `2px solid ${sel === i ? (f.domestic ? "#F6A821" : "#C084FC") : "transparent"}` }}>
              <span style={{ color: f.domestic ? "#F6A821" : "#C084FC", minWidth: 74 }}>
                {f.domestic ? `${f.origin} internal` : `${f.origin} → ${f.target}`}
              </span>
              <span style={{ minWidth: 46, textAlign: "right" }}>{f.pct.toFixed(2)}%</span>
              <span style={{ flex: 1, height: 3, background: C.panel2, borderRadius: 2 }}>
                <span style={{ display: "block", height: "100%", borderRadius: 2,
                  width: `${(f.pct / maxPct) * 100}%`,
                  background: f.domestic ? "#F6A821" : "#C084FC", opacity: 0.7 }} />
              </span>
              {!f.from || !f.to ? (
                <span style={{ fontSize: 9, color: C.faint }}>not mapped</span>
              ) : null}
            </button>
          ))}
          <div className="px-3 py-2" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
            Share of layer 3 attack traffic by volume · origin is a geolocated source IP, target is
            the customer's billing country
            {missing > 0 && ` · ${missing} flow${missing === 1 ? "" : "s"} listed but not drawn (no position for that country)`}
          </div>
        </div>
      </Panel>

      <Panel icon={AlertTriangle} title="INTERNET OUTAGES" note="last 7 days">
        {noPos && (
          <div className="px-3 py-1.5" style={{ fontSize: 10.5, color: C.amber, borderBottom: `1px solid ${C.line}` }}>
            No map position for {noPos} — the outage is listed but cannot be shown on the map.
          </div>
        )}
        {(outages?.outages || []).map((o) => (
          <button key={o.id} onClick={() => {
              // Clicking an outage moves the map above it. The country code is all we have, so the
              // centroid is the honest target — not a pretend pinpoint.
              const c = (o.countries || []).map((x) => LL[x]).find(Boolean);
              if (c && mapRef.current) {
                mapRef.current.setView(c, 3);
                setNoPos(null);
                // PANNING ALONE IS NOT AN ANSWER. At zoom 3 the view shows a whole region and
                // nothing says which country was clicked — the user has to guess from geography.
                // A labelled marker names it. The country CODE is all Cloudflare gives us, so the
                // marker sits on a centroid and the label says the country, not a pinpoint.
                if (markRef.current) markRef.current.remove();
                markRef.current = Leaflet.circleMarker(c, {
                  radius: 10, color: "#F6A821", weight: 2, fill: true,
                  fillColor: "#F6A821", fillOpacity: 0.15,
                }).addTo(mapRef.current)
                  .bindTooltip(
                    `${o.countryNames.join(", ") || o.countries.join(", ")} · ${String(o.cause || "outage").toLowerCase().replace(/_/g, " ")}`,
                    { permanent: true, direction: "top", className: "sw-outage-label" })
                  .openTooltip();
              }
              // A CLICK THAT DOES NOTHING IS INDISTINGUISHABLE FROM A BROKEN BUTTON. Cuba and Guam
              // were absent from the centroid table and the row silently ignored the click. Say
              // which country has no position rather than leaving the reader to wonder.
              else setNoPos(o.countryNames.join(", ") || o.countries.join(", ") || "that location");
            }}
            className="w-full text-left px-3 py-2" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 12, color: C.text }}>
              {o.countryNames.join(", ") || "—"}
              <span className="font-mono" style={{ fontSize: 10, color: C.faint, marginLeft: 6 }}>
                {/* COUNTRY OR ONE PROVIDER — a very different claim. Cloudflare scopes some outages
                    to a single ASN, and the payload distinguishes them so this does not read as a
                    nationwide blackout when one ISP dropped. */}
                {o.scopedTo === "network" ? "one network" : o.scope === "NATIONWIDE" ? "nationwide" : o.scopedTo}
                {o.cause ? ` · ${String(o.cause).toLowerCase().replace(/_/g, " ")}` : ""}
                {!o.end ? " · ongoing" : ""}
              </span>
            </div>
            {o.description && (
              <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>{o.description}</div>
            )}
            {o.networks?.length > 0 && (
              <div className="font-mono" style={{ fontSize: 9.5, color: C.faint, marginTop: 2 }}>
                {o.networks.map((n) => `${n.name} (AS${n.asn})`).join(" · ")}
              </div>
            )}
          </button>
        ))}
        <div className="px-3 py-2" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
          Observed traffic drops, annotated by Cloudflare with a cause where one is established
        </div>
      </Panel>

      <Panel icon={Bug} title="BEING EXPLOITED NOW"
        note={kev ? `${kev.total?.toLocaleString()} in catalogue` : "loading…"}>
        {/* A CVE has no position, so there is nowhere on the map to send it. The useful action is
            the authoritative record — NVD, not a StreetWatch page, because we add nothing to it
            and should not pretend otherwise. */}
        {(kev?.vulnerabilities || []).map((v) => (
          <a key={v.cve} href={`https://nvd.nist.gov/vuln/detail/${v.cve}`}
            target="_blank" rel="noopener noreferrer"
            className="sw-row px-3 py-1.5 flex items-baseline gap-2"
            style={{ borderBottom: `1px solid ${C.line}`, textDecoration: "none" }}>
            <span className="font-mono" style={{ fontSize: 11, color: "#C084FC", minWidth: 120 }}>{v.cve}</span>
            <span style={{ fontSize: 11.5, color: C.text, flex: 1, minWidth: 0 }}>
              {v.vendor} {v.product}
              {v.ransomware && (
                <span className="font-mono" style={{ fontSize: 9, color: "#F0553B", marginLeft: 6 }}>RANSOMWARE</span>
              )}
            </span>
            <span className="font-mono" style={{ fontSize: 10, color: C.faint }}>{v.added}</span>
          </a>
        ))}
        <div className="px-3 py-2" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
          {/* NOT a list of vulnerabilities that exist — a list CISA has CONFIRMED are being used.
              That distinction is the entire value of the KEV catalogue. */}
          Vulnerabilities CISA has confirmed are being actively exploited · updated roughly daily,
          a slower cadence than the panels above
        </div>
      </Panel>

      <div className="flex items-start gap-1.5" style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
        <Info size={11} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Cloudflare Radar (CC BY-NC 4.0) and CISA KEV (US Government public domain). StreetWatch
          adds no attribution of its own and infers nothing about who is responsible.
        </span>
      </div>
    </div>
  );
}

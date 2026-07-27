// Shared palette, layer definitions, and link helpers.
import { Car, Plane, Ship, CloudSun, Camera, PawPrint, Satellite } from "lucide-react";

export const C = {
  ink: "#0E1116", panel: "#161A21", panel2: "#1C212B", line: "#2A303C",
  text: "#E8EAED", dim: "#8A94A3", faint: "#5A6473", amber: "#F6A821", cyan: "#5AC8FA",
};

// Public layers — every source is published for public viewing.
export const LAYERS = {
  traffic:  { label: "Traffic",  icon: Car,       color: "#F6A821", camera: true,  desc: "Public DOT / motorway road cameras." },
  aviation: { label: "Aviation", icon: Plane,     color: "#5AC8FA", camera: false, desc: "Open ADS-B live flight & airport activity." },
  marine:   { label: "Marine",   icon: Ship,      color: "#2563EB", camera: false, desc: "Open AIS live ship positions & ports." },
  weather:  { label: "Earth",    icon: CloudSun,  color: "#A78BFA", camera: false, desc: "Public satellite & weather imagery." },
  webcam:   { label: "Webcams",  icon: Camera,    color: "#37C46A", camera: true,  desc: "Published public webcams — squares, beaches, landmarks." },
  wildlife: { label: "Wildlife", icon: PawPrint,  color: "#A3E635", camera: true,  desc: "Public conservation & nature livestreams." },
  space:    { label: "Space",    icon: Satellite, color: "#F472B6", camera: false, desc: "Live orbital feeds & tracking." },
};
export const layerKeys = Object.keys(LAYERS);

// Route app-pushy sources to web-first viewers that render in the browser.
export const resolveUrl = (cam) =>
  cam.layer === "aviation"
    ? `https://globe.adsbexchange.com/?SiteLat=${cam.lat.toFixed(3)}&SiteLon=${cam.lng.toFixed(3)}`
    : cam.url;
export const openLive = (cam) => { if (typeof window !== "undefined") window.open(resolveUrl(cam), "_blank", "noopener,noreferrer"); };

// Shared activity-heat colour scale.
//
// Two bugs this fixes. First, intensity was contacts/max — LINEAR — and this data is heavily
// skewed: one region at 344 while most sit in single digits pushed almost every circle to the
// bottom of the ramp, so everything looked equally quiet. A log scale spreads the busy middle
// where the differences actually are. Second, WorldMap and HeatMap each had their own ramp
// indexing, so the same site could be a different colour on the two surfaces. One function now.
export const HEAT_RAMP = [
  { at: 0.00, c: "#2DD4BF" },   // teal   — quietest observed
  { at: 0.35, c: "#C084FC" },   // violet
  { at: 0.65, c: "#F6A821" },   // amber
  { at: 0.85, c: "#F87171" },   // red    — busiest observed
];

// contacts -> 0..1 on a log scale, relative to the busiest site in the same window
export function heatIntensity(contacts, max) {
  const c = Math.max(1, Number(contacts) || 0);
  const m = Math.max(2, Number(max) || 2);
  return Math.min(1, Math.log(c) / Math.log(m));
}

export function heatColor(t) {
  let out = HEAT_RAMP[0].c;
  for (const stop of HEAT_RAMP) if (t >= stop.at) out = stop.c;
  return out;
}

// Shared basemap for every Leaflet view.
//
// The previous CARTO dark tiles label places in each place's LOCAL language — Chinese script
// over China, "Afrika", "Moskva" — which reads as broken at continent zoom. Esri's dark canvas
// splits base and labels into two layers and labels in English. One definition here so all
// four maps stay identical; changing basemap ever again is a one-file edit.
export const BASE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const LABEL_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
export const TILE_ATTR = "Esri, HERE, Garmin, © OpenStreetMap contributors";
export const TILE_MAX_ZOOM = 16;

// OpenSeaMap seamark overlay — buoys, beacons, lights, harbours, navigation lines. A
// TRANSPARENT overlay, so it composites onto the Esri basemap rather than replacing it, and it
// works in plain Leaflet: no MapLibre, no vector tiles, no key.
//
// TWO THINGS TO KNOW BEFORE READING IT AS COVERAGE:
// 1. Seamarks only render from roughly z9 upward. At world or continent zoom the layer is
//    legitimately blank — that is the zoom level, NOT an absence of marks. Same standing rule
//    as everywhere else: empty means "not rendered here", never "nothing there".
// 2. The tiles are community-run and donation-funded, not a commercial CDN. They can be slow or
//    briefly unavailable. errorTileUrl is set to a transparent pixel so a failed tile leaves the
//    basemap clean instead of showing a broken-image box over the water.
export const SEAMARK_TILE_URL = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
export const SEAMARK_ATTR = "Sea marks © OpenSeaMap contributors";
export const SEAMARK_MIN_ZOOM = 9;
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Returns the layer so a caller can remove() it; callers that never toggle can ignore it.
export function addSeamarks(Leaflet, map) {
  return Leaflet.tileLayer(SEAMARK_TILE_URL, {
    attribution: SEAMARK_ATTR,
    minZoom: SEAMARK_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    opacity: 0.9,
    errorTileUrl: BLANK_PNG,
  }).addTo(map);
}

export function addBaseTiles(Leaflet, map) {
  Leaflet.tileLayer(BASE_TILE_URL, { attribution: TILE_ATTR, maxZoom: TILE_MAX_ZOOM }).addTo(map);
  Leaflet.tileLayer(LABEL_TILE_URL, { maxZoom: TILE_MAX_ZOOM, pane: "shadowPane" }).addTo(map);
}

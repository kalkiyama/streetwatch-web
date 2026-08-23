// Everything the Space tab needs to know ABOUT a satellite group, kept apart from the code that
// draws them. Colours, plain-language descriptions, and the density rules live here so the view
// files stay about rendering.

// One colour per group. With fourteen toggles a single colour makes the layer meaningless the
// moment two are on, and the chips wear the same colour so the chips ARE the legend — a separate
// key would be one more thing that can drift out of step with the map.
// None of these is the ISS pink: the one live-tracked object stays visually unique.
export const GROUP_COLOR = {
  stations: "#A78BFA",
  gnss: "#38BDF8",
  weather: "#34D399",
  resource: "#22D3EE",
  planet: "#2DD4BF",
  spire: "#14B8A6",
  starlink: "#94A3B8",
  oneweb: "#A3B8CC",
  "iridium-NEXT": "#7DD3FC",
  geo: "#FB923C",
  military: "#F87171",
  science: "#C4B5FD",
  "last-30-days": "#FBBF24",
  active: "#CBD5E1",
};

// What each group actually IS, in plain language. A chip labelled "Spire" or "GNSS" means nothing
// to someone who has not worked with this data, and a map of unexplained dots is decoration rather
// than information — the same reason every other panel in this app explains its own numbers.
//
// Operator and purpose are stated because they are the interesting part: who put it there and what
// it does. Where a claim would need a source the app does not have, it is left out rather than
// guessed at.
export const GROUP_INFO = {
  stations: {
    what: "Crewed space stations",
    text: "The ISS (US, Russia, Europe, Japan, Canada) and China's Tiangong, plus the supply craft docked to them. About 400km up, one orbit every 90 minutes.",
  },
  gnss: {
    what: "Navigation constellations",
    text: "GPS (US), Galileo (EU), GLONASS (Russia) and BeiDou (China). These broadcast the timing signals your phone uses to work out where it is. Medium orbit, around 20,000km.",
  },
  weather: {
    what: "Weather satellites",
    text: "Meteorological craft operated by national agencies — NOAA, EUMETSAT, JMA and others. A mix of polar orbits that sweep the whole planet and geostationary ones that watch a fixed face.",
  },
  resource: {
    what: "Earth observation",
    text: "Imaging and environmental monitoring — land use, ice, vegetation, disasters. Mostly government and agency craft such as Landsat and Sentinel, in low polar orbits.",
  },
  planet: {
    what: "Planet Labs fleet",
    text: "A commercial imaging constellation (US) of small satellites photographing the whole land surface daily. Sold to agriculture, mapping, finance and journalism.",
  },
  spire: {
    what: "Spire Global fleet",
    text: "Commercial nanosatellites (US) that listen rather than photograph — ship and aircraft tracking signals, plus GPS radio occultation for weather forecasting.",
  },
  starlink: {
    what: "Starlink broadband",
    text: "SpaceX's consumer internet constellation (US), the largest ever built and still growing. Low orbit around 550km, which is why so many are needed for continuous coverage.",
  },
  oneweb: {
    what: "OneWeb broadband",
    text: "A rival low-orbit internet constellation (UK/India, Eutelsat), aimed at governments, airlines and shipping rather than households. Higher and fewer than Starlink.",
  },
  "iridium-NEXT": {
    what: "Iridium voice and data",
    text: "Satellite phones and machine-to-machine messaging (US), covering the poles that most networks miss. The constellation that keeps ships and remote crews reachable.",
  },
  geo: {
    what: "Geostationary belt",
    text: "Television, communications and relay craft parked 35,786km up, where an orbit takes exactly one day so they hang over a fixed spot. This is why satellite dishes never move.",
  },
  military: {
    // The ONLY heading here carrying a caveat, because for this group the COUNT is the misleading
    // part: "Military · 24 plotted — the full set" invites the conclusion that two dozen military
    // satellites exist. That correction cannot sit behind a tap.
    what: "Military — the 24 CelesTrak publishes, not all that fly",
    text: "The objects CelesTrak publishes under its military heading: around two dozen reconnaissance craft, mostly German SAR-Lupe and French Helios. NOT a complete list of military satellites — most are unpublished or not identified as such, and this app does not guess.",
  },
  science: {
    what: "Science missions",
    text: "Telescopes and research craft — Hubble among them — plus astrophysics and space-weather observatories. Small in number, long in mission life.",
  },
  "last-30-days": {
    what: "Launched in the last 30 days",
    text: "Everything catalogued in the past month, whoever launched it and whatever it does. The clearest view of who is currently putting things into orbit.",
  },
  active: {
    what: "Every active object",
    text: "The whole catalogue of functioning satellites — roughly 16,000 objects, which is most of what is up there working. Includes everything in the other groups, so it is shown on its own.",
  },
};

// `active` CONTAINS every other group, so plotting it alongside them draws the same satellites
// twice at identical positions — visible as an odd doubling rather than an obvious error. The
// groups are not siblings, so the UI does not pretend they are.
export const EXCLUSIVE = "active";

// How many objects to actually plot. The catalogue reaches 16,000; a phone cannot propagate that
// many even off the main thread, and a reviewer meeting a frozen tab is a worse outcome than a
// sampled constellation. Desktop gets the full choice, phones get a fixed honest subset.
export const DENSITIES = [
  { key: 500, label: "500" },
  { key: 2000, label: "2,000" },
  { key: 0, label: "All" },      // 0 means no client limit
];
export const MOBILE_LIMIT = 1500;

// Capability, not screen width: a tablet in landscape is wider than some laptops and throttles
// harder, while a narrow laptop window is perfectly capable. Core count plus a coarse pointer is
// a better proxy for "can this device propagate 16,000 orbits" than pixels.
export function isConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse || cores <= 4;
}

// Orbit bands. The boundaries are the real ones: low Earth orbit runs to about 2,000km, medium
// orbit holds the navigation constellations around 20,000km, and geostationary sits at 35,786km.
// Colouring by band turns an undifferentiated grey catalogue into a picture of where things fly.
export function altColor(km) {
  if (km < 2000) return "#38BDF8";        // LEO — imaging, broadband, stations
  if (km < 30000) return "#A78BFA";       // MEO — navigation
  return "#FB923C";                       // GEO and above — comms, weather
}


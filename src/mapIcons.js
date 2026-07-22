// Shared SVG silhouettes for map markers, so contacts read as what they are at a glance —
// an aircraft shape for flights, a distinct drone shape for UAVs, a ship for vessels, a station
// for the ISS — instead of identical coloured dots.
//
// Design constraints:
//   - Tiny (they render at ~18px on a busy map), so shapes are bold and simple, not detailed.
//   - Coloured via currentColor / a passed fill, to match the existing per-kind palette.
//   - Returned as Leaflet divIcons; heading rotation is applied when a track angle is known.
//
// Honesty note carried by callers, not here: a silhouette is a CATEGORY hint, not a positive
// identification of a specific airframe. An "MQ-9-style" glyph means "classified as a UAV",
// never "this is confirmed to be an MQ-9". The shapes are deliberately generic per category
// for that reason — we do not draw a Reaper vs a Global Hawk, because we do not know which it is.

// One selection colour, shared by every surface: nothing else on the maps uses green, so a
// green glow reads instantly and uniquely as "this is the contact I picked".
export const SEL_GREEN = "#37F58B";

const svg = (inner, { size = 20, rot = 0, color = "#fff", glow = null, glowR = 4 } = {}) =>
  `<div style="transform:translate(-50%,-50%) rotate(${rot}deg);width:${size}px;height:${size}px;
     display:flex;align-items:center;justify-content:center;
     ${glow ? `filter:drop-shadow(0 0 ${glowR}px ${glow});` : ""}">
     <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"
          stroke="rgba(4,13,18,0.85)" stroke-width="0.6">${inner}</svg>
   </div>`;

// A fixed-wing aircraft, nose up (rotate to heading).
const PLANE = `<path d="M12 2 L13.4 9 L22 13 L22 15 L13.4 13.6 L13 20 L16 22 L16 23 L12 22 L8 23 L8 22 L11 20 L10.6 13.6 L2 15 L2 13 L10.6 9 Z"/>`;

// A UAV / drone: swept flying-wing silhouette, distinct from a manned airliner.
const DRONE = `<path d="M12 4 L13 11 L23 14 L23 15.5 L13 14.4 L12.7 18 L15 20 L15 21 L12 20 L9 21 L9 20 L11.3 18 L11 14.4 L1 15.5 L1 14 L11 11 Z"/><circle cx="12" cy="12" r="1.3" fill="rgba(4,13,18,0.9)"/>`;

// A surface vessel, bow up.
const SHIP = `<path d="M12 2 C13.6 4 14 6 14 9 L14 17 C14 18.5 13.2 20 12 21 C10.8 20 10 18.5 10 17 L10 9 C10 6 10.4 4 12 2 Z"/><rect x="10.6" y="9" width="2.8" height="1.4" fill="rgba(4,13,18,0.85)"/>`;

// The ISS: central module with two solar-array wings.
const STATION = `<rect x="10.5" y="8" width="3" height="8" rx="0.6"/><rect x="2" y="10.5" width="6.5" height="3" rx="0.4"/><rect x="15.5" y="10.5" width="6.5" height="3" rx="0.4"/><line x1="12" y1="8" x2="12" y2="4" stroke="currentColor" stroke-width="1.2"/>`;

export function planeIcon(Leaflet, { heading = 0, color = "#5AC8FA", size = 18, selected = false } = {}) {
  return Leaflet.divIcon({ className: "", html: svg(PLANE, { size, rot: heading, color: selected ? SEL_GREEN : color, glow: selected ? SEL_GREEN : null, glowR: 6 }), iconSize: [0, 0] });
}
export function droneIcon(Leaflet, { heading = 0, color = "#C084FC", size = 18, faint = false, selected = false } = {}) {
  return Leaflet.divIcon({ className: "", html: svg(DRONE, { size, rot: heading, color: selected ? SEL_GREEN : (faint ? color + "88" : color), glow: selected ? SEL_GREEN : (faint ? null : color), glowR: selected ? 6 : 4 }), iconSize: [0, 0] });
}
export function shipIcon(Leaflet, { heading = 0, color = "#2563EB", size = 18, selected = false } = {}) {
  return Leaflet.divIcon({ className: "", html: svg(SHIP, { size, rot: heading, color: selected ? SEL_GREEN : color, glow: selected ? SEL_GREEN : null, glowR: 6 }), iconSize: [0, 0] });
}
export function stationIcon(Leaflet, { color = "#F472B6", size = 22 } = {}) {
  return Leaflet.divIcon({ className: "", html: svg(STATION, { size, color, glow: color }), iconSize: [0, 0] });
}

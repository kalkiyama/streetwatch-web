// Keep a SELECTED, MOVING contact in view.
//
// The problem this solves: you select an aircraft, zoom in to watch it, and a minute later it has
// flown off the edge of the screen. The map centred once at selection time and then never moved
// again, so the thing you asked to watch is the one thing you can no longer see.
//
// Design decisions, both deliberate:
//
// 1. FOLLOW ONLY WHEN IT LEAVES THE COMFORTABLE MIDDLE, not on every position update. Re-centring
//    on every tick makes the map twitch constantly and the world slide around under a stationary
//    dot, which is disorienting and looks broken. We pan only once the contact crosses out of an
//    inner rectangle, so small movements are ignored and the pan reads as deliberate.
//
// 2. NEVER FIGHT A DELIBERATE PAN. If the user drags the map — to look at something else, or to
//    see where the contact is heading — following pauses briefly. Yanking the view back while
//    someone is actively navigating is worse than losing the contact. Zooming does NOT pause it:
//    zooming in on a contact is exactly when you most want it followed.
//
// SHARED MODULE, same pattern as addBaseTiles() and mapIcons.js: every map calls this, so the
// behaviour is identical everywhere and a future unified map inherits it unchanged.

const lastUserPan = new WeakMap();

// Call once per map, right after it is created.
export function watchUserPan(map) {
  if (!map || typeof map.on !== "function") return;
  map.on("dragstart", () => lastUserPan.set(map, Date.now()));
}

/**
 * Pan the map so `latlng` is visible again, but only if it has drifted out of the inner area
 * and the user has not just panned by hand.
 *
 * @param {object} map     Leaflet map instance
 * @param {Array}  latlng  [lat, lng] of the thing being followed
 * @param {object} opts    pad: how much of the edge counts as "about to be lost" (0.25 = ignore
 *                         the outer quarter); quietMs: how long to leave the user alone after a
 *                         manual drag; duration: pan animation seconds.
 * @returns {boolean}      true if a pan was issued
 */
export function keepInView(map, latlng, { pad = 0.22, quietMs = 5000, duration = 0.6 } = {}) {
  if (!map || !latlng) return false;
  const lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
  const lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const panned = lastUserPan.get(map) || 0;
  if (Date.now() - panned < quietMs) return false;   // they are driving; leave them alone

  try {
    // Negative padding shrinks the bounds, giving an inner rectangle. Outside it, the contact is
    // close enough to the edge that it is about to be lost.
    const inner = map.getBounds().pad(-pad);
    if (inner.contains([lat, lng])) return false;    // still comfortably on screen
    map.panTo([lat, lng], { animate: true, duration });
    return true;
  } catch {
    return false;                                    // map not ready / unmounted
  }
}

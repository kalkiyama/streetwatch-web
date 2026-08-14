// SGP4 propagation, off the main thread.
//
// WHY THIS EXISTS: a tester on a budget Android reported the globe crawling with Starlink on,
// while the same build ran clean on a flagship. Starlink is 10,754 objects, and propagating them
// on the main thread is 100ms+ of blocked JavaScript per pass — the UI has no frames left to give.
// Here the cost lands on a worker core and the main thread only ever receives a finished buffer.
//
// The worker OWNS the satrecs. They are parsed once from element sets and reused every tick;
// shipping them back and forth would cost more than the propagation.

import * as sat from "satellite.js";

const store = new Map();   // group -> [{ id, name, satrec }]

// One geodetic solve. Returns null rather than throwing, so a single decayed object cannot end a
// whole pass.
function geo(satrec, when, gmst) {
  try {
    const pv = sat.propagate(satrec, when);
    if (!pv || !pv.position) return null;
    const gd = sat.eciToGeodetic(pv.position, gmst);
    const lat = sat.degreesLat(gd.latitude);
    const lon = sat.degreesLong(gd.longitude);
    const alt = gd.height;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) return null;
    return [lat, lon, alt];
  } catch { return null; }
}

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "load") {
    const out = [];
    for (const s of msg.sats) {
      try {
        const satrec = sat.twoline2satrec(s.l1, s.l2);
        if (satrec && !satrec.error) out.push({ id: s.id, name: s.name, satrec });
      } catch { /* a malformed element set is dropped, not fatal */ }
    }
    store.set(msg.group, out);
    self.postMessage({ type: "loaded", group: msg.group, parsed: out.length, asked: msg.sats.length });
    return;
  }

  if (msg.type === "drop") { store.delete(msg.group); return; }

  if (msg.type === "tick") {
    // msg: { at (ms), ahead (ms), groups: [{ group, index, limit }] }
    const when = new Date(msg.at);
    const next = new Date(msg.at + (msg.ahead || 1000));
    const g0 = sat.gstime(when), g1 = sat.gstime(next);

    let budget = 0;
    for (const g of msg.groups) {
      const list = store.get(g.group);
      if (list) budget += g.limit ? Math.min(list.length, g.limit) : list.length;
    }

    // Both the position NOW and one step AHEAD travel back together, because the views interpolate
    // between them to turn a 1Hz solve into 60fps motion. Sending only the current position would
    // make the dots step once a second, which is exactly what they used to do.
    const a = new Float32Array(budget * 2);   // lat, lon at `at`
    const b = new Float32Array(budget * 2);   // lat, lon at `at + ahead`
    const alt = new Float32Array(budget);
    const grp = new Uint8Array(budget);
    let n = 0;

    for (const g of msg.groups) {
      const list = store.get(g.group);
      if (!list || !list.length) continue;
      // Sampling is EVEN, not "first N": the catalogue is ordered by launch, so the head of
      // Starlink is one orbital plane rather than a constellation. A stride spreads the sample
      // across the whole shell, which is what makes a subset still look like the real thing.
      const want = g.limit ? Math.min(list.length, g.limit) : list.length;
      const stride = list.length / want;
      for (let k = 0; k < want && n < budget; k++) {
        const o = list[Math.floor(k * stride)];
        if (!o) continue;
        const p0 = geo(o.satrec, when, g0);
        if (!p0) continue;
        const p1 = geo(o.satrec, next, g1) || p0;
        a[n * 2] = p0[0]; a[n * 2 + 1] = p0[1];
        b[n * 2] = p1[0]; b[n * 2 + 1] = p1[1];
        alt[n] = p0[2];
        grp[n] = g.index;
        n++;
      }
    }

    // Buffers are TRANSFERRED, not copied: at 16,000 objects a structured clone would be a
    // megabyte a second of pure copying, while a transfer is a pointer handover.
    self.postMessage(
      { type: "positions", at: msg.at, n, a: a.buffer, b: b.buffer, alt: alt.buffer, grp: grp.buffer },
      [a.buffer, b.buffer, alt.buffer, grp.buffer]
    );
  }
};

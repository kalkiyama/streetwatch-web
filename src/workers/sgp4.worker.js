// SGP4 propagation, off the main thread.
//
// WHY THIS EXISTS: a full-catalogue pass is ~16,000 SGP4 solves. On the main thread that is
// 100-200ms of blocked JavaScript every tick — the globe visibly hitches, scrolling stutters, and
// on a phone the tab can appear frozen. Here the cost lands on a worker core and the UI thread
// only ever receives a finished Float32Array.
//
// The worker holds the satrecs. They are parsed once from element sets and reused every tick;
// shipping them back and forth would cost more than the propagation.

import * as sat from "satellite.js";

const store = new Map();   // group -> [{ id, name, satrec }]

// Positions travel back as transferable Float32Arrays rather than arrays of objects: 16,000
// objects would be a multi-megabyte structured clone every tick, while a buffer handover is a
// pointer swap with no copy at all.

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "load") {
    // sats: [{ id, name, l1, l2 }]
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
    // msg: { at (ms), groups: [{ group, index, limit }] }
    const when = new Date(msg.at);
    const gmst = sat.gstime(when);

    let total = 0;
    for (const g of msg.groups) {
      const list = store.get(g.group);
      if (list) total += Math.min(list.length, g.limit || list.length);
    }

    const pos = new Float32Array(total * 3);   // lat, lon, altKm
    const grp = new Uint8Array(total);
    const ids = new Int32Array(total);
    let n = 0, attempted = 0;

    for (const g of msg.groups) {
      const list = store.get(g.group);
      if (!list) continue;
      // Sampling is EVEN, not "first N": the catalogue is ordered by launch, so taking the head
      // of Starlink would show one orbital plane rather than a constellation. A stride spreads
      // the sample across the whole shell, which is what makes a subset look representative.
      const want = Math.min(list.length, g.limit || list.length);
      const stride = list.length / want;
      for (let k = 0; k < want; k++) {
        const o = list[Math.floor(k * stride)];
        if (!o) continue;
        attempted++;
        try {
          const pv = sat.propagate(o.satrec, when);
          if (!pv || !pv.position) continue;
          const gd = sat.eciToGeodetic(pv.position, gmst);
          const lat = sat.degreesLat(gd.latitude);
          const lon = sat.degreesLong(gd.longitude);
          const alt = gd.height;
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) continue;
          pos[n * 3] = lat; pos[n * 3 + 1] = lon; pos[n * 3 + 2] = alt;
          grp[n] = g.index; ids[n] = o.id;
          n++;
        } catch { /* one bad element set must not stop the sweep */ }
      }
    }

    // `plotted` and `attempted` differ when elements are too old to propagate or the object has
    // decayed. Reporting both is what stops a chip claiming 12,000 while 11,400 are on screen.
    self.postMessage(
      { type: "positions", at: msg.at, n, attempted, pos: pos.buffer, grp: grp.buffer, ids: ids.buffer },
      [pos.buffer, grp.buffer, ids.buffer]
    );
    return;
  }

  if (msg.type === "counts") {
    const out = {};
    for (const [k, v] of store) out[k] = v.length;
    self.postMessage({ type: "counts", counts: out });
  }
};

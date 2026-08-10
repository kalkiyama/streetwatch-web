// CelesTrak element sets for the satellite layer.
//
// WHY THIS LIVES ON VERCEL AND NOT THE RENDER PROXY: CelesTrak silently drops connections from
// Render's egress (UND_ERR_CONNECT_TIMEOUT after 25s, Aug 10 2026) while answering Vercel in
// ~400ms. The proxy keeps every other upstream; this one source moves here.
//
// HONESTY RULE: positions derived from these elements are COMPUTED by SGP4 on the client, never
// observed — a different data class from ADS-B and AIS, which the object itself broadcasts.
// `computed: true` rides in every payload so the distinction cannot be lost before the label.

const CT = "https://celestrak.org/NORAD/elements/gp.php";

// `cap` is the HARD render limit. Starlink alone is 10,761 objects; the full catalogue is ~28,000.
// Rendering them kills the map — the exact culling problem WorldMap was built to avoid. When a
// group is capped the payload says so, and the UI must say so too ("showing 200 of 10,761").
const GROUPS = {
  stations:       { label: "Space stations",    cap: 30 },
  "last-30-days": { label: "Recent launches",   cap: 250 },
  "gps-ops":      { label: "GPS",               cap: 40 },
  galileo:        { label: "Galileo",           cap: 40 },
  weather:        { label: "Weather",           cap: 80 },
  resource:       { label: "Earth observation", cap: 120 },
  geo:            { label: "Geostationary",     cap: 200 },
  starlink:       { label: "Starlink",          cap: 200 },
};

function parseTle(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trimEnd()).filter((s) => s.length);
  const out = [];
  for (let i = 0; i + 2 <= lines.length; i += 3) {
    const name = lines[i], l1 = lines[i + 1], l2 = lines[i + 2];
    if (!l1 || !l2 || l1[0] !== "1" || l2[0] !== "2") continue;
    out.push({ name: name.trim(), id: Number(l1.slice(2, 7)), l1, l2 });
  }
  return out;
}

// Epoch age is the honesty number here. A TLE hours old is accurate to metres; one weeks old can
// be kilometres off. Surfacing it stops a stale element set masquerading as a live position.
function epochAgeHours(l1) {
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return (Date.now() - (Date.UTC(year, 0, 1) + (doy - 1) * 86400000)) / 3600000;
}

export default async function handler(req, res) {
  const u = new URL(req.url, "https://streetwatch.earth");

  if (u.searchParams.get("groups") !== null) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    return res.status(200).json({
      groups: Object.entries(GROUPS).map(([k, v]) => ({ group: k, label: v.label, cap: v.cap })),
    });
  }

  const g = u.searchParams.get("group") || "stations";
  // Validate against the known set — the group name becomes part of the upstream URL.
  if (!GROUPS[g])
    return res.status(400).json({ error: "unknown_group", detail: g, known: Object.keys(GROUPS) });

  try {
    const r = await fetch(`${CT}?GROUP=${encodeURIComponent(g)}&FORMAT=tle`, {
      headers: { "User-Agent": "streetwatch.earth (contact via site)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`celestrak ${r.status}`);
    const all = parseTle(await r.text());
    if (!all.length) throw new Error("celestrak returned no element sets");

    const sats = all.slice(0, GROUPS[g].cap);
    const ages = sats.map((s) => epochAgeHours(s.l1)).filter((n) => Number.isFinite(n));

    // Edge cache, not in-memory: these functions are stateless between invocations. Elements
    // change a few times a day, so 6h is generous to CelesTrak and invisible to us.
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({
      group: g, label: GROUPS[g].label,
      total: all.length, served: sats.length, capped: all.length > sats.length,
      oldestEpochHours: ages.length ? Math.round(Math.max(...ages) * 10) / 10 : null,
      source: "CelesTrak GP", computed: true,
      sats,
    });
  } catch (e) {
    return res.status(502).json({
      error: "upstream_unavailable", source: "celestrak", group: g,
      detail: e.cause ? `${e.message}: ${e.cause.code || e.cause}` : e.message,
    });
  }
}

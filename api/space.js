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

// Groups are organised by WHAT THE OBJECT DOES, which is what CelesTrak's catalogue actually
// records. There is no reliable military/civilian flag in this data, so the app does not invent
// one: `military` below is CelesTrak's own curated list of ~24 reconnaissance satellites, labelled
// as exactly that rather than as "all military satellites". Starlink stays under communications
// because it is a consumer ISP; its defence variant (Starshield) CelesTrak does not publish, so
// there is no honest way to separate it.
//
// `cap` bounds the SERVER payload. How many of those get plotted is a separate CLIENT decision
// (the density chips), and both numbers are reported so neither can hide behind the other.
const GROUPS = {
  stations:       { label: "Stations",          cat: "Crewed",      cap: 30 },
  gnss:           { label: "Navigation",        cat: "Navigation",  cap: 200 },
  weather:        { label: "Weather",           cat: "Observation", cap: 100 },
  resource:       { label: "Earth imaging",     cat: "Observation", cap: 150 },
  planet:         { label: "Planet",            cat: "Observation", cap: 150 },
  spire:          { label: "Spire",             cat: "Observation", cap: 100 },
  starlink:       { label: "Starlink",          cat: "Comms",       cap: 12000 },
  oneweb:         { label: "OneWeb",            cat: "Comms",       cap: 800 },
  "iridium-NEXT": { label: "Iridium",           cat: "Comms",       cap: 100 },
  geo:            { label: "Geostationary",     cat: "Comms",       cap: 700 },
  military:       { label: "Military (listed)", cat: "Other",       cap: 60 },
  science:        { label: "Science",           cat: "Other",       cap: 80 },
  "last-30-days": { label: "New launches",      cat: "Other",       cap: 400 },
  active:         { label: "Everything",        cat: "Other",       cap: 20000 },
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
  // `vite dev` does not run Vercel functions, so the dev client calls this deployed function
  // cross-origin. Public data, no credentials, no cookies — a wildcard origin is the whole story.
  res.setHeader("Access-Control-Allow-Origin", "*");
  const u = new URL(req.url, "https://streetwatch.earth");

  if (u.searchParams.get("groups") !== null) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    return res.status(200).json({
      groups: Object.entries(GROUPS).map(([k, v]) => ({ group: k, label: v.label, cat: v.cat, cap: v.cap })),
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

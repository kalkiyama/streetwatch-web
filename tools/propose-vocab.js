#!/usr/bin/env node
// Offline vocabulary expansion — proposes additions, NEVER ships them.
//
// The point of this tool is the boundary it refuses to cross. Classification at runtime stays
// regex against a hand-reviewed list: deterministic, free, auditable, and incapable of
// inventing a vessel. What a model is genuinely good at is the open-vocabulary problem —
// "what other uncrewed surface vessel programmes exist that we haven't listed?" — which no
// amount of pattern matching can answer.
//
// So: run this occasionally, read what it proposes, VERIFY EACH ONE YOURSELF, and paste the
// keepers into ais-proxy.js. It writes a review file and nothing else. It cannot modify the
// shipped lists, by design — if it could, a hallucinated vessel name would become a
// classification rule, and the archive would start flagging fishing boats as sea drones.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node tools/propose-vocab.js
//   -> writes tools/vocab-proposals.json for you to review by hand

const fs = require("fs");
const path = require("path");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
if (!KEY) { console.error("Set ANTHROPIC_API_KEY first."); process.exit(1); }

// Current lists, pasted from ais-proxy.js so this tool needs no imports from the server.
const CURRENT_USV = [
  "SAILDRONE", "DRIX", "SEA HUNTER", "SEAHAWK", "MARINER", "RANGER", "NOMAD", "VANGUARD",
  "WAVE GLIDER", "MAXLIMER", "BLUEBOTTLE", "SEATRAC", "MAYFLOWER", "C-WORKER", "CUSV",
  "SEAGULL", "KATANA", "USV", "ASV", "UUV",
];
const CURRENT_SUBSUP = [
  "BELOS", "KOMMUNA", "IGOR BELOUSOV", "ZVEZDOCHKA", "ANTEO", "ALEMDAR", "CHEONGHAEJIN",
  "SWIFT RESCUE", "BESANT", "STOKER", "NISTAR", "SUBSEA", "SUBMARINE", "RESCUE",
];

const SYSTEM = `You propose additions to a vessel-name matching list used by a public ship-tracking tool.

Return ONLY a JSON array. No markdown fence, no commentary.

Each element:
{
  "term": "UPPERCASE NAME OR DISTINCTIVE FRAGMENT",
  "category": "usv" | "subsupport",
  "reason": "one sentence: what this is and why it belongs",
  "confidence": "high" | "medium" | "low",
  "falsePositiveRisk": "one sentence: what ordinary civilian vessel names this could wrongly match"
}

Rules:
- Only real, publicly documented vessels, classes or programmes. If you are not confident it
  exists, omit it entirely. An omission costs nothing; a fabrication corrupts an archive.
- Prefer distinctive terms. A term like "OCEAN" or "SUPPORT" matches hundreds of merchant
  ships and is worse than useless — mark such terms "low" and explain the risk honestly.
- "usv" = uncrewed/autonomous surface vessels of any nation, civilian or military.
- "subsupport" = SURFACE ships that support submarine operations: rescue ships, tenders,
  submarine support vessels. Never submarines themselves.
- Do not propose terms already present in the supplied lists.
- Aim for 10-25 proposals total, quality over quantity.`;

async function main() {
  const user =
`Already matched (do not repeat):
USV terms: ${CURRENT_USV.join(", ")}
Sub-support terms: ${CURRENT_SUBSUP.join(", ")}

Propose additional terms for both categories.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM,
      messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) { console.error("API error", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  const json = await res.json();
  const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

  let items;
  try { items = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { console.error("Could not parse response:\n", text.slice(0, 500)); process.exit(1); }

  const out = {
    generated: new Date().toISOString(),
    model: MODEL,
    warning: "PROPOSALS ONLY. Verify every term against a real source before adding it to ais-proxy.js. Terms with high falsePositiveRisk will mislabel ordinary vessels.",
    accepted: [],           // move entries here yourself once verified
    proposals: items,
  };
  const dest = path.join(__dirname, "vocab-proposals.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));

  const byRisk = { high: 0, medium: 0, low: 0 };
  items.forEach((i) => { byRisk[i.confidence] = (byRisk[i.confidence] || 0) + 1; });
  console.log(`${items.length} proposals written to ${dest}`);
  console.log(`confidence: ${byRisk.high || 0} high · ${byRisk.medium || 0} medium · ${byRisk.low || 0} low`);
  console.log("\nNothing has been added to the app. Review the file, verify each term, then paste");
  console.log("the ones you trust into the lists in ais-proxy.js.");
}

main().catch((e) => { console.error(e); process.exit(1); });

// Military callsign conventions — STATIC LOOKUP, no model at runtime.
//
// Why static: attributing a callsign to an operator is exactly the claim that must never be
// hallucinated. A wrong "RCH01 = US Air Mobility Command" in an archive that people cite is
// the error that discredits everything around it. So this table is generated offline
// (tools/propose-callsigns.js), reviewed by a human, and shipped as data. Runtime does a
// prefix match and nothing else.
//
// Every entry here is a published, widely-documented callsign convention — the kind printed in
// aviation references and used openly by air traffic control. Nothing inferred, nothing rare,
// nothing guessed. When in doubt it was left out: a short list that is right beats a long list
// that is plausible.
//
// IMPORTANT SEMANTICS: a callsign convention indicates the OPERATOR'S FLIGHT PROGRAMME, not the
// aircraft's owner, mission, or intent. Crews also use these loosely. Everything surfaced from
// this table is labelled "callsign convention" and carries that caveat.

export const CALLSIGN_PREFIXES = [
  // --- United States ---
  { prefix: "RCH", operator: "US Air Mobility Command", note: "\"Reach\" — strategic airlift and tanker missions" },
  { prefix: "TABOR", operator: "US Air Force", note: "special operations airlift" },
  { prefix: "SPAR", operator: "US Air Force", note: "\"Special Air Resources\" — distinguished-visitor transport" },
  { prefix: "SAM", operator: "US Air Force", note: "\"Special Air Mission\" — executive transport" },
  { prefix: "EXEC", operator: "US Air Force", note: "executive transport" },
  { prefix: "CNV", operator: "US Navy", note: "\"Convoy\" — Navy logistics" },
  { prefix: "VVLC", operator: "US Navy", note: "fleet logistics" },
  { prefix: "VENUS", operator: "US Air Force", note: "VIP transport" },
  { prefix: "PAT", operator: "US Army", note: "\"Priority Air Transport\"" },
  { prefix: "DUKE", operator: "US Air Force", note: "training and support" },
  { prefix: "TREK", operator: "US Air Force", note: "tanker operations" },
  { prefix: "ESSO", operator: "US Air Force", note: "aerial refuelling" },
  { prefix: "GOLD", operator: "US Air Force", note: "aerial refuelling" },
  { prefix: "QID", operator: "US Air Force", note: "tanker operations" },
  { prefix: "HOMER", operator: "US Air Force", note: "surveillance operations" },
  { prefix: "JAKE", operator: "US Air Force", note: "reconnaissance operations" },
  { prefix: "FORTE", operator: "US Air Force", note: "RQ-4 Global Hawk surveillance flights" },
  { prefix: "HAWK", operator: "US Air Force", note: "surveillance operations" },
  { prefix: "REDEYE", operator: "US Air Force", note: "reconnaissance operations" },
  { prefix: "MAGMA", operator: "US Navy", note: "maritime patrol" },
  { prefix: "PEACH", operator: "US Navy", note: "maritime patrol" },
  { prefix: "RANGER", operator: "US Coast Guard", note: "patrol operations" },
  { prefix: "COAST", operator: "US Coast Guard", note: "general operations" },

  // --- United Kingdom ---
  { prefix: "ASCOT", operator: "Royal Air Force", note: "transport and tanker operations" },
  { prefix: "RRR", operator: "Royal Air Force", note: "\"Rafair\" — RAF general operations" },
  { prefix: "COMET", operator: "Royal Air Force", note: "VIP transport" },
  { prefix: "KRH", operator: "Royal Air Force", note: "surveillance operations" },
  { prefix: "ZEUS", operator: "Royal Air Force", note: "reconnaissance operations" },

  // --- NATO and Europe ---
  { prefix: "NATO", operator: "NATO", note: "NATO-operated aircraft, incl. E-3 AWACS fleet" },
  { prefix: "MAGIC", operator: "NATO", note: "E-3 AWACS airborne early warning" },
  { prefix: "GAF", operator: "German Air Force", note: "Luftwaffe transport and VIP flights" },
  { prefix: "CFC", operator: "Royal Canadian Air Force", note: "\"Canforce\" — general operations" },
  { prefix: "FAF", operator: "French Air and Space Force", note: "general operations" },
  { prefix: "IAM", operator: "Italian Air Force", note: "general operations" },
  { prefix: "AME", operator: "Spanish Air Force", note: "general operations" },
  { prefix: "NAF", operator: "Royal Netherlands Air Force", note: "general operations" },
  { prefix: "BAF", operator: "Belgian Air Force", note: "general operations" },
  { prefix: "SVF", operator: "Swedish Air Force", note: "general operations" },
  { prefix: "NOW", operator: "Royal Norwegian Air Force", note: "general operations" },
  { prefix: "PLF", operator: "Polish Air Force", note: "general operations" },
  { prefix: "HUAF", operator: "Hungarian Air Force", note: "general operations" },
  { prefix: "CEF", operator: "Czech Air Force", note: "general operations" },

  // --- Other ---
  { prefix: "AUSSIE", operator: "Royal Australian Air Force", note: "transport operations" },
  { prefix: "ASY", operator: "Royal Australian Air Force", note: "general operations" },
  { prefix: "KIWI", operator: "Royal New Zealand Air Force", note: "general operations" },
  { prefix: "IAF", operator: "Israeli Air Force", note: "general operations" },
  { prefix: "JASDF", operator: "Japan Air Self-Defense Force", note: "general operations" },
];

// longest prefix wins, so "SAM" never shadows a longer, more specific match
const SORTED = [...CALLSIGN_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);

export function lookupCallsign(callsign) {
  if (!callsign) return null;
  const cs = String(callsign).toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const e of SORTED) {
    if (cs.startsWith(e.prefix)) {
      return {
        operator: e.operator,
        note: e.note,
        matched: e.prefix,
        // The honesty this whole table exists to preserve:
        basis: "callsign convention — indicates the operator's flight programme, not the aircraft's owner or mission. Crews use these loosely and conventions change.",
      };
    }
  }
  return null;
}

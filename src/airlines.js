// ICAO airline designators, for turning a callsign into an operator name.
//
// WHY THIS EXISTS: ADS-B carries no airline field. `operator` comes back null on essentially every
// aircraft, because the aircraft does not broadcast who runs it — it broadcasts an identifier. The
// first three letters of a commercial callsign ARE the ICAO airline designator, though, so
// "EIN93T" is Aer Lingus flight 93T. That is a lookup, not a guess.
//
// WHAT THIS DELIBERATELY DOES NOT DO: origin and destination. Those are not in ADS-B at all.
// Flight trackers show routes because they license schedule data and join it to the callsign;
// inferring a route from a position would be invention, which is the one thing this app does not
// do with a number. If a route ever appears here it will be because a real schedule source was
// added, and it will say so.
//
// Not exhaustive — a few hundred of the busiest operators. An unmatched prefix shows the raw
// callsign, which is honest: it means "we do not know who this is", not "this is a private plane".

const AIRLINES = {
  AAL: "American", ACA: "Air Canada", AFL: "Aeroflot", AFR: "Air France", AIC: "Air India",
  ANA: "All Nippon", ANZ: "Air New Zealand", ASA: "Alaska", AUA: "Austrian", AZA: "ITA Airways",
  BAW: "British Airways", BEL: "Brussels", BER: "Eurowings", BOX: "AeroLogic", BTI: "airBaltic",
  CAL: "China Airlines", CCA: "Air China", CES: "China Eastern", CFG: "Condor", CKS: "Kalitta",
  CPA: "Cathay Pacific", CSN: "China Southern", CTN: "Croatia", DAL: "Delta", DLH: "Lufthansa",
  EIN: "Aer Lingus", ELY: "El Al", ETD: "Etihad", ETH: "Ethiopian", EVA: "EVA Air",
  EZY: "easyJet", FDX: "FedEx", FIN: "Finnair", GFA: "Gulf Air", GLO: "Gol",
  IBE: "Iberia", ICE: "Icelandair", IGO: "IndiGo", JAL: "Japan Airlines", JBU: "JetBlue",
  KAL: "Korean Air", KLM: "KLM", LOT: "LOT", LNI: "Lion Air", MAS: "Malaysia",
  MSR: "EgyptAir", NAX: "Norwegian", NKS: "Spirit", PAL: "Philippine", QFA: "Qantas",
  QTR: "Qatar Airways", RAM: "Royal Air Maroc", RJA: "Royal Jordanian", ROU: "Air Canada Rouge",
  RYR: "Ryanair", SAS: "SAS", SIA: "Singapore", SVA: "Saudia", SWA: "Southwest",
  SWR: "SWISS", TAM: "LATAM", TAP: "TAP", THA: "Thai", THY: "Turkish",
  TOM: "TUI", TRA: "Transavia", TVF: "Transavia France", UAE: "Emirates", UAL: "United",
  UPS: "UPS", VIR: "Virgin Atlantic", VLG: "Vueling", VOI: "Volaris", WJA: "WestJet",
  WZZ: "Wizz Air", AEE: "Aegean", AEA: "Air Europa", AHY: "Azerbaijan", AMX: "Aeroméxico",
  ABW: "AirBridgeCargo", ARG: "Aerolíneas Argentinas", AZU: "Azul", BAV: "Bamboo",
  CSC: "Sichuan", CXA: "Xiamen", DHK: "DHL Air", DHX: "DHL", EDW: "Edelweiss",
  ETW: "Edelweiss", FIA: "Fiji", GIA: "Garuda", HAL: "Hawaiian", HVN: "Vietnam Airlines",
  JAI: "Jet Airways", JST: "Jetstar", KQA: "Kenya Airways", LAN: "LATAM Chile",
  MAU: "Air Mauritius", MEA: "Middle East", NCA: "Nippon Cargo", OMA: "Oman Air",
  PGT: "Pegasus", RBA: "Royal Brunei", SEJ: "SpiceJet", SLK: "SilkAir", SQC: "Singapore Cargo",
  SXS: "SunExpress", TGW: "Scoot", UZB: "Uzbekistan", VJC: "VietJet", WUK: "Wizz Air UK",
};

// 7500 hijack, 7600 radio failure, 7700 general emergency. These are the only squawk codes worth
// surfacing: every other value is routine ATC housekeeping and means nothing to a reader.
const EMERGENCY_SQUAWKS = { 7500: "HIJACK", 7600: "RADIO FAILURE", 7700: "EMERGENCY" };

export function airlineFromCallsign(callsign) {
  if (!callsign || callsign.length < 4) return null;
  const p = callsign.slice(0, 3).toUpperCase();
  // A commercial callsign is three letters then digits. A registration used as a callsign (N12345,
  // G-ABCD) is not, and must not be matched against the table by accident.
  if (!/^[A-Z]{3}$/.test(p) || !/\d/.test(callsign.slice(3))) return null;
  return AIRLINES[p] || null;
}

export function emergencyFromSquawk(squawk) {
  return EMERGENCY_SQUAWKS[Number(squawk)] || null;
}

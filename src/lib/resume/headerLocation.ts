/**
 * Map the Workbench Location field → resume header city.
 * Deterministic (not LLM): West Coast jobs → San Jose, CA;
 * East Coast → New York, NY; Remote / elsewhere → New York, NY.
 */

export const HEADER_LOCATION_DEFAULT = "New York, NY";
export const HEADER_LOCATION_WEST = "San Jose, CA";
export const HEADER_LOCATION_EAST = "New York, NY";

export type CoastBucket = "west" | "east" | "neither";

export type HeaderLocationDecision = {
  coast: CoastBucket;
  headerLocation: string;
  /** Short note for cascade / UI. */
  reason: string;
};

const WEST_STATE =
  /\b(ca|california|or|oregon|nv|nevada)\b|\bwa\b|\bwashington\s+state\b/i;


const WEST_CITY =
  /\b(seattle|bellevue|redmond|tacoma|portland|eugene|san\s*francisco|sf\b|oakland|berkeley|san\s*jose|sanjose|palo\s*alto|mountain\s*view|sunnyvale|cupertino|santa\s*clara|sacramento|los\s*angeles|la\b|santa\s*monica|irvine|san\s*diego|las\s*vegas|reno)\b/i;

const EAST_STATE =
  /\b(ny|new\s*york|nj|new\s*jersey|ct|connecticut|ma|massachusetts|pa|pennsylvania|de|delaware|md|maryland|dc|washington,?\s*d\.?c\.?|va|virginia|nc|north\s*carolina|sc|south\s*carolina|ga|georgia|fl|florida|ri|rhode\s*island|nh|new\s*hampshire|vt|vermont|me|maine)\b/i;

const EAST_CITY =
  /\b(new\s*york|nyc|brooklyn|manhattan|boston|cambridge|philadelphia|philly|pittsburgh|baltimore|washington|arlington|alexandria|richmond|raleigh|durham|charlotte|atlanta|miami|tampa|orlando|jacksonville|providence|hartford|newark|jersey\s*city|hoboken)\b/i;

function isRemoteOrEmpty(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return true;
  return (
    /\bremote\b/.test(t) ||
    t === "unspecified" ||
    t === "n/a" ||
    t === "na" ||
    t === "anywhere"
  );
}

function isWestCoast(raw: string): boolean {
  return WEST_STATE.test(raw) || WEST_CITY.test(raw);
}

function isEastCoast(raw: string): boolean {
  // Avoid matching "Washington" state (WA) as DC — WEST_STATE already catches WA.
  // "Washington, DC" / "Washington D.C." covered by EAST_STATE.
  return EAST_STATE.test(raw) || EAST_CITY.test(raw);
}

/**
 * Infer header location from the Controls location text field at cascade time.
 */
export function resolveHeaderLocation(
  detectedLocation: string,
): HeaderLocationDecision {
  const raw = detectedLocation.trim();

  if (isRemoteOrEmpty(raw)) {
    return {
      coast: "neither",
      headerLocation: HEADER_LOCATION_DEFAULT,
      reason: raw
        ? `Remote/unspecified ("${raw}") → header ${HEADER_LOCATION_DEFAULT}`
        : `Empty location → header ${HEADER_LOCATION_DEFAULT}`,
    };
  }

  // DC before "Washington" / WA heuristics
  if (/\b(washington,?\s*d\.?c\.?|district of columbia)\b/i.test(raw)) {
    return {
      coast: "east",
      headerLocation: HEADER_LOCATION_EAST,
      reason: `East Coast ("${raw}") → header ${HEADER_LOCATION_EAST}`,
    };
  }

  if (isWestCoast(raw)) {
    return {
      coast: "west",
      headerLocation: HEADER_LOCATION_WEST,
      reason: `West Coast ("${raw}") → header ${HEADER_LOCATION_WEST}`,
    };
  }

  if (isEastCoast(raw)) {
    return {
      coast: "east",
      headerLocation: HEADER_LOCATION_EAST,
      reason: `East Coast ("${raw}") → header ${HEADER_LOCATION_EAST}`,
    };
  }

  return {
    coast: "neither",
    headerLocation: HEADER_LOCATION_DEFAULT,
    reason: `Neither coast ("${raw}") → header ${HEADER_LOCATION_DEFAULT}`,
  };
}

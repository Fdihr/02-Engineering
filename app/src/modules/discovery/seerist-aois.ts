import { err, ok, type Result } from "../../core/result.js";

export type SeeristCountryAoi = {
  aoiId: string;
  iso2: string;
  iso3: string;
  displayName: string;
  officialName?: string;
};

export type SeeristAoiError = "INVALID_SEERIST_AOIS_PAYLOAD";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const ISO2_TO_ISO3: Record<string, string> = {
  AD: "AND", AE: "ARE", AF: "AFG", AG: "ATG", AL: "ALB", AM: "ARM", AO: "AGO", AR: "ARG", AT: "AUT", AU: "AUS",
  AZ: "AZE", BA: "BIH", BB: "BRB", BD: "BGD", BE: "BEL", BF: "BFA", BG: "BGR", BH: "BHR", BI: "BDI", BJ: "BEN",
  BN: "BRN", BO: "BOL", BR: "BRA", BS: "BHS", BT: "BTN", BW: "BWA", BY: "BLR", BZ: "BLZ", CA: "CAN", CD: "COD",
  CF: "CAF", CG: "COG", CH: "CHE", CI: "CIV", CL: "CHL", CM: "CMR", CN: "CHN", CO: "COL", CR: "CRI", CU: "CUB",
  CV: "CPV", CY: "CYP", CZ: "CZE", DE: "DEU", DJ: "DJI", DK: "DNK", DM: "DMA", DO: "DOM", DZ: "DZA", EC: "ECU",
  EE: "EST", EG: "EGY", ER: "ERI", ES: "ESP", ET: "ETH", FI: "FIN", FJ: "FJI", FR: "FRA", GA: "GAB", GB: "GBR",
  GD: "GRD", GE: "GEO", GH: "GHA", GM: "GMB", GN: "GIN", GQ: "GNQ", GR: "GRC", GT: "GTM", GW: "GNB", GY: "GUY",
  HK: "HKG", HN: "HND", HR: "HRV", HT: "HTI", HU: "HUN", ID: "IDN", IE: "IRL", IL: "ISR", IN: "IND", IQ: "IRQ",
  IR: "IRN", IS: "ISL", IT: "ITA", JM: "JAM", JO: "JOR", JP: "JPN", KE: "KEN", KG: "KGZ", KH: "KHM", KM: "COM",
  KN: "KNA", KP: "PRK", KR: "KOR", KW: "KWT", KZ: "KAZ", LA: "LAO", LB: "LBN", LC: "LCA", LI: "LIE", LK: "LKA",
  LR: "LBR", LS: "LSO", LT: "LTU", LU: "LUX", LV: "LVA", LY: "LBY", MA: "MAR", MC: "MCO", MD: "MDA", ME: "MNE",
  MG: "MDG", MK: "MKD", ML: "MLI", MM: "MMR", MN: "MNG", MO: "MAC", MR: "MRT", MT: "MLT", MU: "MUS", MV: "MDV",
  MW: "MWI", MX: "MEX", MY: "MYS", MZ: "MOZ", NA: "NAM", NE: "NER", NG: "NGA", NI: "NIC", NL: "NLD", NO: "NOR",
  NP: "NPL", NZ: "NZL", OM: "OMN", PA: "PAN", PE: "PER", PG: "PNG", PH: "PHL", PK: "PAK", PL: "POL", PS: "PSE",
  PT: "PRT", PY: "PRY", QA: "QAT", RO: "ROU", RS: "SRB", RU: "RUS", RW: "RWA", SA: "SAU", SB: "SLB", SC: "SYC",
  SD: "SDN", SE: "SWE", SG: "SGP", SI: "SVN", SK: "SVK", SL: "SLE", SM: "SMR", SN: "SEN", SO: "SOM", SR: "SUR",
  SS: "SSD", ST: "STP", SV: "SLV", SY: "SYR", SZ: "SWZ", TD: "TCD", TG: "TGO", TH: "THA", TJ: "TJK", TL: "TLS",
  TM: "TKM", TN: "TUN", TO: "TON", TR: "TUR", TT: "TTO", TW: "TWN", TZ: "TZA", UA: "UKR", UG: "UGA", US: "USA",
  UY: "URY", UZ: "UZB", VA: "VAT", VC: "VCT", VE: "VEN", VN: "VNM", VU: "VUT", WS: "WSM", XK: "RKS", YE: "YEM",
  ZA: "ZAF", ZM: "ZMB", ZW: "ZWE"
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB",
  "u.k.": "GB",
  britain: "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  us: "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "united states": "US",
  "united states of america": "US",
  russia: "RU",
  "russian federation": "RU",
  "south korea": "KR",
  "republic of korea": "KR",
  rok: "KR",
  "north korea": "KP",
  dprk: "KP",
  iran: "IR",
  syria: "SY",
  taiwan: "TW",
  kosovo: "XK",
  czechia: "CZ",
  "czech republic": "CZ",
  turkey: "TR",
  turkiye: "TR",
  "türkiye": "TR",
  uae: "AE",
  "united arab emirates": "AE",
  vietnam: "VN",
  "viet nam": "VN",
  moldova: "MD",
  venezuela: "VE",
  bolivia: "BO",
  tanzania: "TZ",
  drc: "CD",
  "democratic republic of the congo": "CD",
  palestine: "PS"
};

const SUPRANATIONAL_LABELS = new Set([
  "global",
  "world",
  "worldwide",
  "europe",
  "northern europe",
  "eastern europe",
  "western europe",
  "southern europe",
  "central europe",
  "nordics",
  "nordic",
  "baltics",
  "baltic",
  "baltic sea",
  "north sea",
  "black sea",
  "mediterranean",
  "eu",
  "european union",
  "nato",
  "emea",
  "apac",
  "asia",
  "east asia",
  "southeast asia",
  "south asia",
  "central asia",
  "middle east",
  "mena",
  "africa",
  "north africa",
  "sub-saharan africa",
  "americas",
  "north america",
  "latin america",
  "south america"
]);

const normalizeKey = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");

const buildDefaultDirectory = (): SeeristCountryAoi[] => {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  return Object.entries(ISO2_TO_ISO3).map(([iso2, iso3]) => {
    const label =
      iso2 === "XK"
        ? "Kosovo"
        : (regionNames.of(iso2) ?? iso2);
    return {
      aoiId: iso2.toLowerCase(),
      iso2,
      iso3,
      displayName: label
    };
  });
};

const DEFAULT_DIRECTORY = buildDefaultDirectory();

/**
 * Parses the plain JSON array of GeoJSON country features returned by `GET /v1/aois/country`.
 */
export const parseSeeristCountryAois = (
  payload: unknown
): Result<SeeristCountryAoi[], SeeristAoiError> => {
  if (!Array.isArray(payload)) {
    return err("INVALID_SEERIST_AOIS_PAYLOAD");
  }

  const countries: SeeristCountryAoi[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    if (!isRecord(entry) || !isRecord(entry.properties)) {
      return err("INVALID_SEERIST_AOIS_PAYLOAD");
    }
    const rawIso2 = nonEmptyString(entry.properties.iso2)?.toUpperCase();
    const rawIso3 = nonEmptyString(entry.properties.iso3)?.toUpperCase();
    const displayName =
      nonEmptyString(entry.properties.displayName) ??
      nonEmptyString(entry.properties.officialName) ??
      nonEmptyString(entry.properties.officalName);
    const officialName =
      nonEmptyString(entry.properties.officialName) ??
      nonEmptyString(entry.properties.officalName);
    if (
      !rawIso2 ||
      !/^[A-Z]{2}$/.test(rawIso2) ||
      !rawIso3 ||
      !/^[A-Z]{3}$/.test(rawIso3) ||
      !displayName
    ) {
      return err("INVALID_SEERIST_AOIS_PAYLOAD");
    }
    const aoiId = rawIso2.toLowerCase();
    if (seen.has(aoiId)) {
      continue;
    }
    seen.add(aoiId);
    countries.push({
      aoiId,
      iso2: rawIso2,
      iso3: rawIso3,
      displayName,
      ...(officialName ? { officialName } : {})
    });
  }

  return ok(countries);
};

/**
 * Deterministically resolves country AOIs from free-text research geography strings.
 * Broad supranational regions (e.g. "Europe", "Global", "Baltic Sea", "NATO") are ignored
 * rather than guessed.
 */
export const resolveGeographyAois = (
  geographies: readonly string[],
  directory: readonly SeeristCountryAoi[] = DEFAULT_DIRECTORY
): SeeristCountryAoi[] => {
  const byIso2 = new Map<string, SeeristCountryAoi>();
  const byIso3 = new Map<string, SeeristCountryAoi>();
  const byName = new Map<string, SeeristCountryAoi>();

  for (const entry of directory) {
    const iso2 = entry.iso2.toUpperCase();
    const iso3 = entry.iso3.toUpperCase();
    byIso2.set(iso2, entry);
    byIso3.set(iso3, entry);
    byName.set(normalizeKey(entry.displayName), entry);
    if (entry.officialName) {
      byName.set(normalizeKey(entry.officialName), entry);
    }
  }

  const resolved: SeeristCountryAoi[] = [];
  const seen = new Set<string>();
  const recordMatch = (match: SeeristCountryAoi | undefined): void => {
    if (match && !seen.has(match.aoiId)) {
      seen.add(match.aoiId);
      resolved.push(match);
    }
  };

  for (const rawGeography of geographies) {
    const segments = rawGeography
      .split(/[,;/|]+|\band\b/i)
      .map((part) => part.trim().replace(/^[()[\]\s]+|[()[\]\s]+$/g, ""))
      .filter(Boolean);

    for (const segment of segments) {
      const normalized = normalizeKey(segment);
      if (!normalized || SUPRANATIONAL_LABELS.has(normalized)) {
        continue;
      }

      const aliasIso2 = COUNTRY_ALIASES[normalized];
      if (aliasIso2 && byIso2.has(aliasIso2)) {
        recordMatch(byIso2.get(aliasIso2));
        continue;
      }

      const named = byName.get(normalized);
      if (named) {
        recordMatch(named);
        continue;
      }

      if (/^[A-Za-z]{2}$/.test(segment)) {
        recordMatch(byIso2.get(segment.toUpperCase()));
        continue;
      }

      if (/^[A-Za-z]{3}$/.test(segment)) {
        recordMatch(byIso3.get(segment.toUpperCase()));
      }
    }
  }

  return resolved;
};

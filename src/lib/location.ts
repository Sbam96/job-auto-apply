// Reads a job's location text and decides whether it fits one of the user's locations (MT-01, PR-06).
// Pure: no clock, no network.

import type { Region, WorkMode } from "./config";
import type { UserLocation } from "./types";

const US_WORDS = ["united states", "usa", "u.s.", "u.s.a", "us only", "us-remote", "remote us", "us remote", "north america"];
const US_CITIES = ["new york", "nyc", "san francisco", "los angeles", "chicago", "seattle", "boston", "austin", "denver", "atlanta", "miami", "washington dc", "dallas", "houston", "philadelphia", "phoenix", "san diego", "portland", "minneapolis", "nashville", "charlotte", "raleigh", "pittsburgh", "salt lake city", "san jose", "brooklyn", "jersey city", "detroit", "columbus", "baltimore"];
const US_STATES = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "wisconsin", "wyoming"];
const US_CODES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
const CA_WORDS = ["canada", "toronto", "vancouver", "montreal", "montréal", "ottawa", "calgary", "edmonton", "ontario", "british columbia", "quebec", "québec", "alberta", "winnipeg", "halifax"];
const CA_CITIES = ["toronto", "vancouver", "montreal", "ottawa", "calgary", "edmonton", "winnipeg", "halifax"];
const CA_CODES = ["ON", "BC", "QC", "AB", "MB", "NS", "SK", "NB", "NL", "PE"];
const UK_COUNTRY = ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"];
const UK_CITIES = ["london", "manchester", "edinburgh", "glasgow", "bristol", "leeds", "birmingham", "cambridge", "oxford", "liverpool", "belfast", "cardiff", "newcastle", "nottingham", "sheffield", "brighton"];
const EMEA_WORDS = ["emea", "europe", "european union", "eu", "eea", "middle east", "africa"];
const EMEA_COUNTRIES: Record<string, string[]> = {
  germany: ["germany", "berlin", "munich", "hamburg", "frankfurt", "cologne"],
  france: ["france", "paris", "lyon"],
  spain: ["spain", "madrid", "barcelona", "valencia"],
  portugal: ["portugal", "lisbon", "porto"],
  ireland: ["ireland", "dublin", "cork"],
  netherlands: ["netherlands", "amsterdam", "rotterdam", "utrecht"],
  belgium: ["belgium", "brussels"],
  italy: ["italy", "milan", "rome"],
  poland: ["poland", "warsaw", "krakow", "kraków", "wroclaw"],
  sweden: ["sweden", "stockholm"],
  denmark: ["denmark", "copenhagen"],
  norway: ["norway", "oslo"],
  finland: ["finland", "helsinki"],
  switzerland: ["switzerland", "zurich", "zürich", "geneva"],
  austria: ["austria", "vienna"],
  czechia: ["czech republic", "czechia", "prague"],
  romania: ["romania", "bucharest"],
  greece: ["greece", "athens"],
  estonia: ["estonia", "tallinn"],
  lithuania: ["lithuania", "vilnius"],
  hungary: ["hungary", "budapest"],
  israel: ["israel", "tel aviv"],
  uae: ["united arab emirates", "uae", "dubai", "abu dhabi"],
  "south africa": ["south africa", "cape town", "johannesburg"],
  nigeria: ["nigeria", "lagos"],
  kenya: ["kenya", "nairobi"],
  egypt: ["egypt", "cairo"],
  turkey: ["turkey", "türkiye", "istanbul"],
};
const ANYWHERE_WORDS = ["anywhere", "worldwide", "world wide", "global", "globally", "any location"];
const CITY_ALIASES: Record<string, string> = { nyc: "new york", "new york city": "new york", sf: "san francisco", la: "los angeles", dc: "washington dc", "washington, dc": "washington dc" };

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole-word match, so "uk" doesn't match "ukraine" and "us" doesn't match "business".
const has = (text: string, word: string) => new RegExp(`(^|[^a-zà-ü])${escape(word)}($|[^a-zà-ü])`, "i").test(text);
const hasCode = (raw: string, code: string) => new RegExp(`(,|\\(|-|\\s)\\s*${code}(\\)|\\s|,|$)`).test(raw);

export const cityKey = (c: string) => {
  const k = norm(c);
  return CITY_ALIASES[k] ?? k;
};

export type JobRegion = Region | "ANY";

export interface ParsedLocation {
  raw: string;
  regions: JobRegion[];
  countries: string[];
  cities: string[];
  mode: WorkMode;
}

// Turns a location string into regions, named countries, work mode and cities.
export function parseLocation(text: string, { remote = false } = {}): ParsedLocation {
  const raw = String(text ?? "");
  const t = norm(raw);
  const regions = new Set<JobRegion>();
  const countries = new Set<string>();
  const cities = new Set<string>();

  if (US_WORDS.some((w) => has(t, w)) || /(^|[^a-z])us($|[^a-z])/.test(t) || US_STATES.some((w) => has(t, w))) regions.add("US");
  for (const c of US_CITIES) if (has(t, c)) { regions.add("US"); cities.add(cityKey(c)); }
  const canadian = CA_WORDS.some((w) => has(t, w));
  if (!canadian && US_CODES.some((c) => hasCode(raw, c))) regions.add("US");
  if (canadian || CA_CODES.some((c) => !US_CODES.includes(c) && hasCode(raw, c))) regions.add("CA");
  for (const c of CA_CITIES) if (has(t, c)) cities.add(c);
  if (UK_COUNTRY.some((w) => has(t, w))) { regions.add("UK"); countries.add("uk"); }
  for (const c of UK_CITIES) if (has(t, c)) { regions.add("UK"); countries.add("uk"); cities.add(c); }
  if (EMEA_WORDS.some((w) => has(t, w))) regions.add("EMEA");
  for (const [country, words] of Object.entries(EMEA_COUNTRIES)) {
    if (words.some((w) => has(t, w))) {
      regions.add("EMEA");
      countries.add(country);
      for (const w of words.slice(1)) if (has(t, w)) cities.add(w);
    }
  }
  let mode: WorkMode = "onsite";
  if (/hybrid/.test(t)) mode = "hybrid";
  else if (remote || /remote|work from home|wfh|distributed|home[- ]based/.test(t)) mode = "remote";

  const anywhere = ANYWHERE_WORDS.some((w) => has(t, w));
  if (anywhere && mode === "onsite") mode = "remote"; // "Anywhere" can only mean remote
  if (anywhere || (regions.size === 0 && mode === "remote")) regions.add("ANY");

  return { raw, regions: [...regions], countries: [...countries], cities: [...cities], mode };
}

export type LocationMatch = { ok: true; region: Region; mode: WorkMode } | { ok: false; reason: string };

// MT-01: is the user eligible for this job at one of their locations? Returns the location that fits.
export function matchLocation(loc: ParsedLocation, userLocations: UserLocation[] = []): LocationMatch {
  const reasons: string[] = [];
  for (const pref of userLocations) {
    const modes = pref.modes?.length ? pref.modes : ["remote"];
    if (!modes.includes(loc.mode)) { reasons.push(`${pref.region}: ${loc.mode} not wanted`); continue; }
    const fit = regionFits(loc, pref.region);
    if (!fit.ok) { reasons.push(`${pref.region}: ${fit.reason}`); continue; }
    if (loc.mode !== "remote" && pref.cities?.length) {
      const wanted = pref.cities.map(cityKey);
      if (!loc.cities.some((c) => wanted.includes(c))) { reasons.push(`${pref.region}: city not on your list`); continue; }
    }
    return { ok: true, region: pref.region, mode: loc.mode };
  }
  return { ok: false, reason: reasons.join("; ") || "no locations set" };
}

function regionFits(loc: ParsedLocation, region: Region): { ok: true } | { ok: false; reason: string } {
  const r = loc.regions;
  const otherCountries = loc.countries.filter((c) => c !== "uk");
  const remoteAnywhere = loc.mode === "remote" && r.includes("ANY");
  if (region === "US") return r.includes("US") ? { ok: true } : { ok: false, reason: "not a US role" };
  if (region === "CA") return r.includes("CA") ? { ok: true } : { ok: false, reason: "not a Canadian role" };
  if (region === "UK") {
    if (r.includes("UK")) return { ok: true };
    // A Europe-wide remote role with no country list can be done from the UK.
    if (remoteAnywhere || (loc.mode === "remote" && r.includes("EMEA") && otherCountries.length === 0)) return { ok: true };
    return { ok: false, reason: "not open to the UK" };
  }
  // EMEA
  if (!r.includes("EMEA") && !remoteAnywhere) return { ok: false, reason: "not an EMEA role" };
  // MT-01: remote role limited to named countries, none of them the UK: skip.
  if (loc.mode === "remote" && otherCountries.length && !loc.countries.includes("uk")) {
    return { ok: false, reason: `limited to ${otherCountries.join(", ")}` };
  }
  return { ok: true };
}

// The country a form question is asking about, if it names one.
export function countryIn(text: string): string | null {
  const t = norm(text);
  if (UK_COUNTRY.some((w) => has(t, w))) return "uk";
  if (has(t, "canada")) return "canada";
  if (["united states", "usa", "u.s.", "us", "america"].some((w) => has(t, w))) return "us";
  for (const [country, words] of Object.entries(EMEA_COUNTRIES)) if (has(t, words[0])) return country;
  return null;
}

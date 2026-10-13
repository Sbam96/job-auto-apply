// Locations and the location hard filter. Test names start with the requirement ID they prove.
import { describe, expect, test } from "vitest";
import { matchLocation, parseLocation } from "@/lib/location";
import type { UserLocation } from "@/lib/types";

const mine: UserLocation[] = [
  { region: "US", modes: ["remote"], cities: [] },
  { region: "CA", modes: ["remote"], cities: [] },
  { region: "UK", modes: ["remote", "hybrid"], cities: ["Manchester", "London"] },
  { region: "EMEA", modes: ["remote"], cities: [] },
];
const fit = (text: string, prefs = mine, remote = false) => matchLocation(parseLocation(text, { remote }), prefs);

describe("MT-01 location filter", () => {
  test("MT-01 a US remote role matches the US location", () => {
    expect(fit("Remote - United States")).toMatchObject({ ok: true, region: "US", mode: "remote" });
    expect(fit("Remote, US")).toMatchObject({ ok: true, region: "US" });
    expect(fit("New York, NY (Remote)")).toMatchObject({ ok: true, region: "US" });
  });
  test("MT-01 an on-site US role is skipped when only remote is wanted", () => {
    expect(fit("New York, NY")).toMatchObject({ ok: false });
  });
  test("MT-01 a Canadian remote role matches Canada, not the US", () => {
    expect(fit("Remote - Toronto, Ontario")).toMatchObject({ ok: true, region: "CA" });
    expect(parseLocation("Vancouver, BC").regions).toEqual(["CA"]);
  });
  test("MT-01 hybrid UK roles must be in a listed city", () => {
    expect(fit("Hybrid - Manchester, UK")).toMatchObject({ ok: true, region: "UK", mode: "hybrid" });
    expect(fit("Hybrid - Bristol, UK")).toMatchObject({ ok: false });
  });
  test("MT-01 a Europe-wide remote role with no country list is open from the UK", () => {
    expect(fit("Remote (EMEA)")).toMatchObject({ ok: true });
    expect(fit("Home based - EMEA")).toMatchObject({ ok: true, mode: "remote" });
  });
  test("MT-01 an EMEA role limited to countries that exclude the UK is skipped", () => {
    const r = fit("Remote - Germany, France, Spain");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/limited to germany, france, spain/);
  });
  test("MT-01 an EMEA country list that includes the UK is kept", () => {
    expect(fit("Remote - UK, Germany, Netherlands")).toMatchObject({ ok: true });
  });
  test("MT-01 anywhere and worldwide roles are open", () => {
    expect(fit("Remote - Worldwide")).toMatchObject({ ok: true });
    expect(fit("Anywhere")).toMatchObject({ ok: true });
  });
  test("MT-01 whole-word matching: Ukraine is not the UK and 'business' is not the US", () => {
    expect(parseLocation("Remote - Ukraine").regions).not.toContain("UK");
    expect(parseLocation("Remote business hours").regions).not.toContain("US");
  });
});

describe("PR-06 locations", () => {
  test("PR-06 NYC and New York count as the same city", () => {
    const prefs: UserLocation[] = [{ region: "US", modes: ["hybrid"], cities: ["NYC"] }];
    expect(fit("Hybrid - New York, NY", prefs)).toMatchObject({ ok: true, region: "US" });
  });
  test("PR-06 a location only accepts the work modes ticked for it", () => {
    const prefs: UserLocation[] = [{ region: "UK", modes: ["onsite"], cities: [] }];
    expect(fit("Remote - UK", prefs)).toMatchObject({ ok: false });
    expect(fit("London, UK", prefs)).toMatchObject({ ok: true });
  });
});

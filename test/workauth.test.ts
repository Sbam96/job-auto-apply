// Work authorisation answers and the immigration text.
import { describe, expect, test } from "vitest";
import { answerAuthQuestion, immigrationText, IMMIGRATION_TEXT, wantsCoverLetter } from "@/lib/workauth";

const US = { region: "US", mode: "remote" } as const;
const CA = { region: "CA", mode: "remote" } as const;
const UK = { region: "UK", mode: "hybrid" } as const;
const EMEA = { region: "EMEA", mode: "remote", countries: [] } as const;
const AUTH = "Are you legally authorized to work in the country where this job is located?";
const SPONSOR = "Will you now or in the future require sponsorship for employment visa status?";

describe("WA work authorisation", () => {
  test("WA-01 US roles: not authorised now; sponsorship answered from the setting", () => {
    expect(answerAuthQuestion(AUTH, US)).toBe("No");
    expect(answerAuthQuestion(SPONSOR, US, { usSponsorship: true, canadaSponsorship: true })).toBe("Yes");
    expect(answerAuthQuestion(SPONSOR, US, { usSponsorship: false, canadaSponsorship: true })).toBe("No");
  });
  test("WA-02 Canada roles: not authorised, needs sponsorship, no immigration text", () => {
    expect(answerAuthQuestion(AUTH, CA)).toBe("No");
    expect(answerAuthQuestion(SPONSOR, CA)).toBe("Yes");
    expect(immigrationText(CA)).toBeNull();
  });
  test("WA-03 UK roles: authorised, no sponsorship", () => {
    expect(answerAuthQuestion(AUTH, UK)).toBe("Yes");
    expect(answerAuthQuestion(SPONSOR, UK)).toBe("No");
    expect(answerAuthQuestion("Do you have the right to work in the UK?", UK)).toBe("Yes");
  });
  test("WA-04 remote EMEA: authorised via the UK; a named EU country answers No", () => {
    expect(answerAuthQuestion(AUTH, EMEA)).toBe("Yes");
    expect(answerAuthQuestion(SPONSOR, EMEA)).toBe("No");
    expect(answerAuthQuestion("Are you authorised to work in Germany?", EMEA)).toBe("No");
  });
  test("WA-04 a question naming the US gets the US answer, whatever the job", () => {
    expect(answerAuthQuestion("Are you authorized to work in the United States?", UK)).toBe("No");
  });
  test("WA-05 immigration text only on US roles, exactly as approved", () => {
    expect(immigrationText(US)).toBe(IMMIGRATION_TEXT.long);
    expect(immigrationText(UK)).toBeNull();
    expect(immigrationText(EMEA)).toBeNull();
  });
  test("WA-05 a small box gets the short text; too small for either gets nothing", () => {
    expect(immigrationText(US, 200)).toBe(IMMIGRATION_TEXT.short);
    expect(immigrationText(US, 50)).toBeNull();
  });
  test("non-authorisation questions are left alone", () => {
    expect(answerAuthQuestion("What is your favourite tool?", US)).toBeNull();
  });
});

describe("AP-04 cover letters", () => {
  test("AP-04 written for US, Canada and on-site EU roles; not for UK or remote EMEA unless required", () => {
    expect(wantsCoverLetter(US)).toBe(true);
    expect(wantsCoverLetter(CA)).toBe(true);
    expect(wantsCoverLetter({ region: "EMEA", mode: "onsite", countries: ["germany"] })).toBe(true);
    expect(wantsCoverLetter(UK)).toBe(false);
    expect(wantsCoverLetter(EMEA)).toBe(false);
    expect(wantsCoverLetter(UK, { required: true })).toBe(true);
  });
});

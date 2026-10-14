// SR-08: finding the employer's own link for jobs found on job boards.
import { describe, expect, test } from "vitest";
import { employerSearchUrl, findDirectLink, linkInText, slugCandidates, titleSimilarity } from "@/lib/direct";
import { fakeFetch } from "./fixtures";

const himalayasJob = { title: "RQ08223 - Sr. Business Analyst", company: "Rubicon Path", description: "We're hiring a senior BA." };

describe("SR-08 direct links to the employer", () => {
  test("SR-08 an application link in the job text is used first", () => {
    expect(linkInText("Apply here: https://job-boards.greenhouse.io/acme/jobs/123. Thanks")).toBe("https://job-boards.greenhouse.io/acme/jobs/123");
    expect(linkInText("Apply at https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123")).toContain("myworkdayjobs.com");
    expect(linkInText("Apply on Himalayas")).toBeNull();
  });
  test("SR-08 company names become the slugs job boards use", () => {
    expect(slugCandidates("Rubicon Path Ltd.")).toEqual(["rubiconpath", "rubicon-path", "rubicon"]);
    expect(slugCandidates("EVERSANA")).toEqual(["eversana"]);
  });
  test("SR-08 titles match despite requisition codes and abbreviations", () => {
    expect(titleSimilarity("RQ08223 - Sr. Business Analyst", "Senior Business Analyst")).toBe(1);
    expect(titleSimilarity("Business Analyst", "Senior Software Engineer")).toBeLessThan(0.6);
  });
  test("SR-08 the job is found on the employer's own job board", async () => {
    const { impl } = fakeFetch({
      "https://api.lever.co/v0/postings/rubiconpath?mode=json": [
        { text: "Data Engineer", hostedUrl: "https://jobs.lever.co/rubiconpath/1" },
        { text: "Senior Business Analyst", hostedUrl: "https://jobs.lever.co/rubiconpath/2" },
      ],
    });
    expect(await findDirectLink(himalayasJob, impl)).toEqual({ url: "https://jobs.lever.co/rubiconpath/2", via: "Rubicon Path's Lever job board" });
  });
  test("SR-08 when the employer's board has no such job, nothing is guessed", async () => {
    const { impl } = fakeFetch({ "https://boards-api.greenhouse.io/v1/boards/rubiconpath/jobs": { jobs: [{ title: "Account Executive", absolute_url: "https://x" }] } });
    expect(await findDirectLink(himalayasJob, impl)).toBeNull();
  });
  test("SR-08 the fallback searches for the job on the employer's site, without the requisition code", () => {
    expect(decodeURIComponent(employerSearchUrl(himalayasJob))).toContain('"Rubicon Path" "Sr. Business Analyst" careers apply');
  });
});

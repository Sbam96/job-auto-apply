// Writes test/e2e-results.json keyed by requirement ID: { "AU-01": { pass, detail } }.
// A requirement proven by several tests keeps its first failure.
import { writeFileSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class ResultsReporter implements Reporter {
  private results: Record<string, { pass: boolean; detail: string }> = {};

  onTestEnd(test: TestCase, result: TestResult) {
    const ids = test.title.match(/\b[A-Z0-9]{2,4}-\d{2}\b/g) ?? [test.title.match(/^(A11Y)/)?.[1] ?? test.title];
    const pass = result.status === "passed";
    const detail = pass ? test.title : (result.error?.message ?? result.status).split("\n")[0].slice(0, 300);
    for (const id of ids) {
      const prev = this.results[id];
      if (prev && !prev.pass) continue; // keep the first failure
      this.results[id] = { pass, detail };
    }
  }

  onEnd() {
    writeFileSync("test/e2e-results.json", JSON.stringify(this.results, null, 2));
  }
}

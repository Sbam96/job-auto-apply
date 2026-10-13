// The LLM adapter. One interface, so the model can change by environment variable alone.
// Gemini is the default (free tier). Tests use FakeLLM.

export interface LLM {
  name: string;
  json<T = unknown>(system: string, prompt: string): Promise<T>;
}

type FetchLike = typeof fetch;

export class GeminiLLM implements LLM {
  name: string;
  constructor(
    private apiKey: string,
    private models: string[] = ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    private fetchImpl: FetchLike = fetch,
  ) {
    this.name = `gemini:${models[0]}`;
  }

  async json<T>(system: string, prompt: string): Promise<T> {
    let lastError: unknown;
    // Try each model in turn: a rate limit or a retired model falls through to the next.
    for (const model of this.models) {
      const res = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      });
      if (res.status === 429 || res.status === 404 || res.status >= 500) {
        lastError = new Error(`Gemini ${model} returned ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Gemini ${model} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = await res.json();
      const text: string = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      return parseJson<T>(text);
    }
    throw lastError ?? new Error("No Gemini model available");
  }
}

// Strips code fences some models add around JSON.
export function parseJson<T>(text: string): T {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t) as T;
}

// For tests: returns canned replies and records every prompt it was given.
export class FakeLLM implements LLM {
  name = "fake";
  calls: { system: string; prompt: string }[] = [];
  constructor(private reply: (system: string, prompt: string) => unknown) {}
  async json<T>(system: string, prompt: string): Promise<T> {
    this.calls.push({ system, prompt });
    return this.reply(system, prompt) as T;
  }
}

export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): LLM | null {
  if (!env.GEMINI_API_KEY) return null;
  const models = (env.GEMINI_MODEL ? [env.GEMINI_MODEL] : []).concat(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  return new GeminiLLM(env.GEMINI_API_KEY, [...new Set(models)]);
}

// TL-04: job descriptions are data. Anything in them that looks like instructions to an AI is
// detected, removed before the text reaches the LLM, and the job is flagged for the user.

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "ignore-instructions", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions|prompts?|rules|guidelines|above|previous|prior)\b/i },
  { name: "ai-address", re: /\b(if you are|you are|as) an? (ai|llm|language model|assistant|chatbot|gpt|bot)\b/i },
  { name: "ai-address", re: /\b(chatgpt|claude|gemini|copilot|llm)s?\b[^.\n]{0,30}\b(must|should|please|include|write|respond|mention)\b/i },
  { name: "system-prompt", re: /\b(system prompt|system message|developer message|jailbreak)\b/i },
  { name: "role-tag", re: /(^|\n)\s*(system|assistant|user)\s*:/i },
  { name: "hidden-word", re: /\b(include|insert|mention|use) the (word|phrase|code|keyword)\b/i },
  { name: "markup", re: /<\s*(script|iframe|img[^>]*onerror)/i },
];

export interface InjectionCheck {
  flagged: boolean;
  matches: string[];
  cleaned: string; // the description with suspicious sentences removed
}

export function checkInjection(text: string): InjectionCheck {
  const src = String(text ?? "");
  const matches = new Set<string>();
  const sentences = src.split(/(?<=[.!?])\s+|\n+/);
  const kept: string[] = [];
  for (const s of sentences) {
    const hit = PATTERNS.find((p) => p.re.test(s));
    if (hit) matches.add(hit.name);
    else kept.push(s);
  }
  return { flagged: matches.size > 0, matches: [...matches], cleaned: kept.join(" ").replace(/\s+/g, " ").trim() };
}

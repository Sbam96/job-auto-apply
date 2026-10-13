// Turns job-board HTML into plain text. Small and dependency-free.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", pound: "£", euro: "€" };

export function decodeEntities(s: string): string {
  return String(s ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  // Greenhouse double-encodes its HTML, so decode first, then strip tags.
  let s = decodeEntities(String(html ?? ""));
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\s*(\/p|\/div|\/h\d|\/ul|\/ol)\s*>/gi, "\n\n").replace(/<\s*(br|\/li|\/tr)\s*\/?>/gi, "\n").replace(/<\s*li[^>]*>/gi, "\n- ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

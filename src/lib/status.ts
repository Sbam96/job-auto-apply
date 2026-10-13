// TR-01: which status changes are allowed. Pure.
import type { Status } from "./config";

const NEXT: Record<Status, Status[]> = {
  needs_approval: ["queued", "applied", "skipped", "withdrawn"],
  needs_action: ["queued", "applied", "skipped", "withdrawn"],
  queued: ["applied", "needs_action", "needs_approval", "skipped", "withdrawn"],
  applied: ["response", "interview", "offer", "rejected", "withdrawn"],
  response: ["interview", "offer", "rejected", "withdrawn"],
  interview: ["interview", "offer", "rejected", "withdrawn"],
  offer: ["withdrawn"],
  rejected: [],
  withdrawn: [],
  skipped: ["needs_approval"],
};

export const canMove = (from: Status, to: Status) => NEXT[from]?.includes(to) ?? false;
export const nextStatuses = (from: Status) => NEXT[from] ?? [];

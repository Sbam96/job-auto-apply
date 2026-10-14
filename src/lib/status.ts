// TR-01: which status changes are allowed. Pure.
import type { Status } from "./config";

const NEXT: Record<Status, Status[]> = {
  new: ["applied", "dismissed"],
  applied: ["response", "interview", "offer", "rejected", "new"], // "new" undoes a mistaken "I've applied"
  response: ["interview", "offer", "rejected"],
  interview: ["interview", "offer", "rejected"],
  offer: ["rejected"],
  rejected: [],
  dismissed: ["new"],
  expired: ["new"],
};

export const canMove = (from: Status, to: Status) => NEXT[from]?.includes(to) ?? false;
export const nextStatuses = (from: Status) => NEXT[from] ?? [];

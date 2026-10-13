// An in-memory store for testing whole search runs without a database.
import type { NewApplication, PipelineStore } from "@/lib/pipeline";
import type { Board } from "@/lib/sources";
import type { Job, Profile } from "@/lib/types";

export class MemoryStore implements PipelineStore {
  users: { userId: string; profile: Profile }[] = [];
  boards: Board[] = [];
  fetches = new Map<string, number>();
  jobs = new Map<string, { id: number; job: Job }>();
  apps: (NewApplication & { id: number; day: string })[] = [];
  day = "";

  async activeUsers() { return this.users.filter((u) => !u.profile.paused); }
  async allBoards() { return this.boards; }
  async fetchCount(key: string, day: string) { return this.fetches.get(`${key}|${day}`) ?? 0; }
  async recordFetch(key: string, day: string) { this.fetches.set(`${key}|${day}`, (this.fetches.get(`${key}|${day}`) ?? 0) + 1); }
  async saveJobs(jobs: Job[]) {
    const out = new Map<string, number>();
    for (const job of jobs) {
      const k = `${job.source}:${job.sourceId}`;
      if (!this.jobs.has(k)) this.jobs.set(k, { id: this.jobs.size + 1, job });
      out.set(k, this.jobs.get(k)!.id);
    }
    return out;
  }
  async hasApplication(userId: string, key: string) { return this.apps.some((a) => a.userId === userId && a.dedupeKey === key); }
  async createdOn(userId: string, day: string) { return this.apps.filter((a) => a.userId === userId && a.day === day).length; }
  async createApplication(app: NewApplication) {
    const id = this.apps.length + 1;
    this.apps.push({ ...app, id, day: this.day });
    return id;
  }
}

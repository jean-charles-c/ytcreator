/**
 * JobStore — File-based persistent storage for render jobs.
 * Each job is stored as a JSON file: <storageDir>/<jobId>.json
 * Simple, no external DB dependency. Replace with Postgres/Redis later if needed.
 */

import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join } from "path";

export class JobStore {
  /** @param {string} storageDir */
  constructor(storageDir) {
    this.dir = storageDir;
    this._ready = mkdir(this.dir, { recursive: true }).catch(() => {});
  }

  /** @param {import('./types.js').RenderJob} job */
  async save(job) {
    await this._ready;
    const filePath = join(this.dir, `${job.id}.json`);
    await writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
  }

  /** @param {string} id @returns {Promise<import('./types.js').RenderJob|null>} */
  async get(id) {
    try {
      const data = await readFile(join(this.dir, `${id}.json`), "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /** @param {string|null} projectId @returns {Promise<import('./types.js').RenderJob[]>} */
  async list(projectId) {
    await this._ready;
    try {
      const files = await readdir(this.dir);
      const jobs = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readFile(join(this.dir, file), "utf-8");
          const job = JSON.parse(data);
          if (!projectId || job.projectId === projectId) {
            jobs.push(job);
          }
        } catch { /* skip corrupted files */ }
      }
      // Sort by createdAt descending
      jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return jobs;
    } catch {
      return [];
    }
  }

  /** @returns {number} */
  count() {
    try {
      const { readdirSync } = require("fs");
      return readdirSync(this.dir).filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }
}

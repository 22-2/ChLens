import type { ChFetchMetadata, ThreadData } from "@chlen/ch-lib";

export interface LiveThreadSnapshot {
  url: string;
  data: ThreadData;
  metadata: ChFetchMetadata;
  updatedAt: number;
}

export interface LiveThreadCache {
  get(url: string): Promise<LiveThreadSnapshot | null>;
  set(url: string, snapshot: LiveThreadSnapshot): Promise<void>;
  delete(url: string): Promise<void>;
}

/**
 * In-memory cache for the first Live session implementation.
 *
 * The session owns cache semantics while persistence can later be swapped for the Tauri storage
 * platform without coupling polling and response comparison to a database API.
 */
export class MemoryLiveThreadCache implements LiveThreadCache {
  private readonly entries = new Map<string, LiveThreadSnapshot>();

  async get(url: string): Promise<LiveThreadSnapshot | null> {
    return this.entries.get(url) ?? null;
  }

  async set(url: string, snapshot: LiveThreadSnapshot): Promise<void> {
    this.entries.set(url, snapshot);
  }

  async delete(url: string): Promise<void> {
    this.entries.delete(url);
  }
}

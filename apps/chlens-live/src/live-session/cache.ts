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

/**
 * Persistent cache backed by WebView localStorage.
 *
 * Tauri WebViews retain localStorage between launches, so this gives the session a durable
 * validator/snapshot store without adding another native plugin before the cache schema settles.
 */
export class LocalStorageLiveThreadCache implements LiveThreadCache {
  constructor(private readonly keyPrefix = "chlens-live.thread-cache:") {}

  async get(url: string): Promise<LiveThreadSnapshot | null> {
    const storage = this.getStorage();
    if (!storage) return null;

    try {
      const value = storage.getItem(this.key(url));
      if (!value) return null;
      const snapshot = JSON.parse(value) as LiveThreadSnapshot;
      if (
        snapshot.url !== url ||
        typeof snapshot.updatedAt !== "number" ||
        !snapshot.data ||
        !Array.isArray(snapshot.data.posts) ||
        !snapshot.metadata
      ) {
        return null;
      }
      return snapshot;
    } catch (error: unknown) {
      console.error(`[Chlens Live] thread cache read failed: ${url}`, error);
      return null;
    }
  }

  async set(url: string, snapshot: LiveThreadSnapshot): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      storage.setItem(this.key(url), JSON.stringify(snapshot));
    } catch (error: unknown) {
      console.error(`[Chlens Live] thread cache write failed: ${url}`, error);
    }
  }

  async delete(url: string): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;
    storage.removeItem(this.key(url));
  }

  private key(url: string): string {
    return `${this.keyPrefix}${encodeURIComponent(url)}`;
  }

  private getStorage(): Storage | null {
    return typeof localStorage === "undefined" ? null : localStorage;
  }
}

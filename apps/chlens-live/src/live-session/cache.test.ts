import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  LocalStorageLiveThreadCache,
  MemoryLiveThreadCache,
  type LiveThreadSnapshot,
} from "./cache";

const snapshot: LiveThreadSnapshot = {
  url: "https://bbs.eddibb.cc/liveedge/1000000001/",
  data: { title: "テスト", posts: [] },
  metadata: { etag: '"v1"', bodyBytes: 0, parsedResCount: 0 },
  updatedAt: 123,
};

describe("Live thread cache", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    } as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores and retrieves snapshots in memory", async () => {
    const cache = new MemoryLiveThreadCache();

    await cache.set(snapshot.url, snapshot);

    expect(await cache.get(snapshot.url)).toEqual(snapshot);
  });

  it("persists snapshots in localStorage and removes them", async () => {
    const cache = new LocalStorageLiveThreadCache("test-cache:");

    await cache.set(snapshot.url, snapshot);
    expect(await cache.get(snapshot.url)).toEqual(snapshot);

    await cache.delete(snapshot.url);
    expect(await cache.get(snapshot.url)).toBeNull();
  });

  it("ignores malformed persisted snapshots", async () => {
    const cache = new LocalStorageLiveThreadCache("test-cache:");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    localStorage.setItem("test-cache:https%3A%2F%2Fbbs.eddibb.cc%2Fliveedge%2F1000000001%2F", "{");

    expect(await cache.get(snapshot.url)).toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

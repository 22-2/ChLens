import { beforeEach, describe, expect, it, vi } from "vitest";

// インメモリ ObjectStore（url を keyPath とする）で Cache のブラウザ分岐を検証する。
// fake-indexeddb / webextension-polyfill を避け、Cache のログ用ロジックだけを切り出してテストする。
interface Row {
  url: string;
  [key: string]: unknown;
}

const rows = new Map<string, Row>();

function matchesRange(value: unknown, query: unknown): boolean {
  if (query == null) return true;
  const range = query as {
    upper?: number;
    upperOpen?: boolean;
  };
  if (typeof value !== "number") return false;
  if (range.upper != null) {
    return range.upperOpen ? value < range.upper : value <= range.upper;
  }
  return true;
}

const store = {
  async get(key: string) {
    return rows.get(key) ?? null;
  },
  async put(value: Row) {
    rows.set(value.url, value);
  },
  async delete(key: string) {
    rows.delete(key);
  },
  async getAll() {
    return [...rows.values()];
  },
  async clear() {
    rows.clear();
  },
  async count() {
    return rows.size;
  },
  index(name: string) {
    return {
      async getAll(query?: unknown) {
        return [...rows.values()].filter((row) => matchesRange(row[name], query));
      },
      async getAllKeys(query?: unknown) {
        return [...rows.values()]
          .filter((row) => matchesRange(row[name], query))
          .map((row) => row.url);
      },
    };
  },
};

vi.mock("src/app", () => ({
  platform: {
    storage: {
      getStore: () => store,
    },
  },
}));

vi.mock("src/core/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => false,
  getTauriRepositories: async () => {
    throw new Error("Tauri repository should not be used in browser tests");
  },
}));

vi.mock("src/core/URL", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

async function saveThreadLog(opts: {
  key: string;
  threadUrl: string;
  title: string;
  boardUrl: string;
  data?: string;
  parsed?: unknown;
  resLength?: number;
  lastUpdated: number;
}): Promise<void> {
  const { default: Cache } = await import("src/core/Cache");
  const cache = new Cache(opts.key);
  cache.title = opts.title;
  cache.threadUrl = opts.threadUrl;
  cache.boardUrl = opts.boardUrl;
  cache.kind = "thread";
  cache.resLength = opts.resLength ?? null;
  cache.parsed = opts.parsed ?? null;
  cache.lastUpdated = opts.lastUpdated;
  await cache.put(opts.data ?? "dummy");
  // put() は data 指定時 lastUpdated を Date.now() で上書きするため、明示的に戻す。
  cache.lastUpdated = opts.lastUpdated;
  await cache.put();
}

describe("Cache browser log branch", () => {
  beforeEach(() => {
    rows.clear();
    vi.clearAllMocks();
  });

  it("round-trips log metadata through put/get", async () => {
    const { default: Cache } = await import("src/core/Cache");
    await saveThreadLog({
      key: "https://ex.com/board/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/board/1/",
      title: "テストスレ",
      boardUrl: "https://ex.com/board/",
      resLength: 5,
      lastUpdated: 100,
    });

    const cache = new Cache("https://ex.com/board/dat/1.dat");
    await cache.get();
    expect(cache.title).toBe("テストスレ");
    expect(cache.threadUrl).toBe("https://ex.com/test/read.cgi/board/1/");
    expect(cache.boardUrl).toBe("https://ex.com/board/");
    expect(cache.kind).toBe("thread");
    expect(cache.resLength).toBe(5);
  });

  it("listLogs returns only thread logs, newest first, with threadUrl + isHttps", async () => {
    const { default: Cache } = await import("src/core/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "old",
      boardUrl: "https://ex.com/b/",
      lastUpdated: 100,
    });
    await saveThreadLog({
      key: "http://ex.com/b/dat/2.dat",
      threadUrl: "http://ex.com/test/read.cgi/b/2/",
      title: "new",
      boardUrl: "http://ex.com/b/",
      lastUpdated: 200,
    });
    // スレ以外のキャッシュ（板の subject.txt 等）はログに含めない。
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 300,
      title: "board-cache",
    });

    const logs = await Cache.listLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0]?.title).toBe("new");
    expect(logs[0]?.threadUrl).toBe("http://ex.com/test/read.cgi/b/2/");
    expect(logs[0]?.isHttps).toBe(false);
    expect(logs[1]?.title).toBe("old");
    expect(logs[1]?.isHttps).toBe(true);
  });

  it("deleteLogs removes only thread logs", async () => {
    const { default: Cache } = await import("src/core/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "t",
      boardUrl: "https://ex.com/b/",
      lastUpdated: 100,
    });
    await store.put({
      url: "https://ex.com/b/subject.txt",
      kind: null,
      last_updated: 300,
    });

    await Cache.deleteLogs();

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.url).toBe("https://ex.com/b/subject.txt");
  });

  it("searchLogs matches dat body and parsed content", async () => {
    const { default: Cache } = await import("src/core/Cache");

    await saveThreadLog({
      key: "https://ex.com/b/dat/1.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/1/",
      title: "スレA",
      boardUrl: "https://ex.com/b/",
      data: "名無し<>sage<>2026<> 重要キーワードを含む本文 <>",
      lastUpdated: 100,
    });
    await saveThreadLog({
      key: "https://ex.com/b/dat/2.dat",
      threadUrl: "https://ex.com/test/read.cgi/b/2/",
      title: "スレB",
      boardUrl: "https://ex.com/b/",
      data: "別の本文",
      lastUpdated: 200,
    });

    const hits = await Cache.searchLogs("重要キーワード");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("スレA");

    // クエリが空ならログ全件を返す。
    const all = await Cache.searchLogs("  ");
    expect(all).toHaveLength(2);
  });
});

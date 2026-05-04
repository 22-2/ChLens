import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tauriHistoryRepository: {
    add: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    getUnique: vi.fn(),
    getAll: vi.fn(),
    count: vi.fn(),
    clear: vi.fn(),
    clearRange: vi.fn(),
  },
}));

vi.mock("src/core/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => true,
  getTauriRepositories: async () => ({
    tauriHistoryRepository: state.tauriHistoryRepository,
  }),
}));

vi.mock("src/core/URL.ts", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

vi.mock("src/core/jsutil.js", () => ({
  indexedDBRequestToPromise: vi.fn(),
}));

describe("History Tauri branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    globalThis.app = {
      assertArg: () => false,
      log: vi.fn(),
    } as unknown as typeof globalThis.app;
  });

  it("add delegates to tauriHistoryRepository", async () => {
    const History = await import("src/core/History.js");

    await History.add("https://example.com/thread", "title", 123, "board");

    expect(state.tauriHistoryRepository.add).toHaveBeenCalledWith(
      "https://example.com/thread",
      "title",
      123,
      "board",
    );
  });

  it("get adds isHttps flag for UI compatibility", async () => {
    state.tauriHistoryRepository.get.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        title: "title",
        date: 123,
        boardTitle: "board",
      },
    ]);

    const History = await import("src/core/History.js");
    const rows = await History.get(0, 10);

    expect(state.tauriHistoryRepository.get).toHaveBeenCalledWith(0, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].isHttps).toBe(true);
  });

  it("clearRange passes unix threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));

    const History = await import("src/core/History.js");
    await History.clearRange(7);

    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(state.tauriHistoryRepository.clearRange).toHaveBeenCalledWith(
      expected,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tauriWriteHistoryRepository: {
    add: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
    getByUrl: vi.fn(),
    getAll: vi.fn(),
    count: vi.fn(),
    clear: vi.fn(),
    clearRange: vi.fn(),
  },
}));

vi.mock("src/core/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => true,
  getTauriRepositories: async () => ({
    tauriWriteHistoryRepository: state.tauriWriteHistoryRepository,
  }),
}));

vi.mock("src/core/URL.ts", () => ({
  isHttps: (url: string) => url.startsWith("https://"),
}));

vi.mock("src/core/jsutil.js", () => ({
  indexedDBRequestToPromise: vi.fn(),
}));

describe("WriteHistory Tauri branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    globalThis.app = {
      assertArg: () => false,
      log: vi.fn(),
    } as unknown as typeof globalThis.app;
  });

  it("add delegates with fallback input_name/input_mail", async () => {
    const WriteHistory = await import("src/core/WriteHistory.ts");

    await WriteHistory.add({
      url: "https://example.com/thread",
      res: 42,
      title: "title",
      name: "name",
      mail: "mail",
      message: "message",
      date: 123,
    });

    expect(state.tauriWriteHistoryRepository.add).toHaveBeenCalledWith({
      url: "https://example.com/thread",
      res: 42,
      title: "title",
      name: "name",
      mail: "mail",
      inputName: "name",
      inputMail: "mail",
      message: "message",
      date: 123,
    });
  });

  it("get adds isHttps flag for UI compatibility", async () => {
    state.tauriWriteHistoryRepository.get.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://example.com/thread",
        res: 42,
        title: "title",
        name: "name",
        mail: "mail",
        input_name: "name",
        input_mail: "mail",
        message: "message",
        date: 123,
      },
    ]);

    const WriteHistory = await import("src/core/WriteHistory.ts");
    const rows = await WriteHistory.get(0, 10);

    expect(state.tauriWriteHistoryRepository.get).toHaveBeenCalledWith(0, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].isHttps).toBe(true);
  });
});

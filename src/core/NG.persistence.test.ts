import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  configStore: new Map<string, string>(),
  holdWrites: false,
  pendingWrites: [] as Array<{
    key: string;
    value: string;
    resolve: () => void;
  }>,
  messageSend: vi.fn(),
  toastNotify: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => mocks.configStore.get(key) ?? null,
      set: (key: string, value: string) => {
        if (!mocks.holdWrites) {
          mocks.configStore.set(key, value);
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          mocks.pendingWrites.push({
            key,
            value,
            resolve: () => {
              mocks.configStore.set(key, value);
              resolve();
            },
          });
        });
      },
    },
    toast: {
      notify: mocks.toastNotify,
    },
    message: {
      send: mocks.messageSend,
    },
  },
  INGResult: {},
}));

vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) => value,
  stringToDate: (value: string) => new Date(value.replace(/\//g, "-")),
}));

describe("NG persistence", () => {
  beforeEach(() => {
    mocks.configStore.clear();
    mocks.holdWrites = false;
    mocks.pendingWrites.length = 0;
    mocks.messageSend.mockReset();
    mocks.toastNotify.mockReset();
  });

  it("addはngobj保存完了まで待機し、再読込後もID NGを復元できる", async () => {
    mocks.holdWrites = true;

    const { add, get, invalidateCache, TYPE } = await import("src/core/NG");
    invalidateCache();

    let settled = false;
    const addPromise = add("ID(word=abc123)").then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(mocks.pendingWrites[0]).toMatchObject({
      key: "ngobj",
    });
    expect(settled).toBe(false);
    expect(mocks.messageSend).not.toHaveBeenCalled();

    const firstWrite = mocks.pendingWrites.shift();
    firstWrite?.resolve();
    await Promise.resolve();

    expect(mocks.configStore.get("ngobj")).toContain('"type":"ID"');
    expect(mocks.pendingWrites[0]).toMatchObject({
      key: "ngwords",
      value: "ID(value=abc123)",
    });
    expect(settled).toBe(false);
    expect(mocks.messageSend).not.toHaveBeenCalled();

    const secondWrite = mocks.pendingWrites.shift();
    secondWrite?.resolve();
    await addPromise;

    expect(mocks.messageSend).toHaveBeenCalledWith("ng_changed");
    expect(mocks.messageSend).toHaveBeenCalledTimes(1);

    invalidateCache();
    const parsed = Array.from(get() as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.ID,
      word: "abc123",
    });
  });

  it("新ブロックDSLへの追加は旧形式を混在させない", async () => {
    mocks.configStore.set("ngwords", "hide body:\n  spam");
    const { add, invalidateCache } = await import("src/core/NG");
    invalidateCache();

    await add("ID(value=abc123)");

    expect(mocks.configStore.get("ngwords")).toBe("hide id:\n  abc123\n\nhide body:\n  spam");
  });
});

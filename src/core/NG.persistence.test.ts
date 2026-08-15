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

vi.mock("src/core/jsutil", () => ({
  normalize: (value: string) => value.toLowerCase(),
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
    toast: { notify: mocks.toastNotify },
    message: { send: mocks.messageSend },
  },
}));

describe("NG Rule persistence", () => {
  beforeEach(() => {
    mocks.configStore.clear();
    mocks.holdWrites = false;
    mocks.pendingWrites.length = 0;
    mocks.messageSend.mockReset();
    mocks.toastNotify.mockReset();
  });

  it("waits for the DSL write and restores the Rule after reload", async () => {
    mocks.holdWrites = true;
    const { add, get, invalidateCache } = await import("src/core/NG");
    invalidateCache();

    let settled = false;
    const addPromise = add("hide id:\n  abc123").then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(mocks.pendingWrites[0]).toMatchObject({ key: "ngwords" });
    expect(settled).toBe(false);
    expect(mocks.messageSend).not.toHaveBeenCalled();

    const write = mocks.pendingWrites.shift();
    write?.resolve();
    await addPromise;

    expect(mocks.configStore.get("ngwords")).toBe("hide id:\n  abc123");
    expect(mocks.messageSend).toHaveBeenCalledWith("ng_changed");

    invalidateCache();
    expect(get()).toEqual([
      expect.objectContaining({
        action: "hide",
        target: "id",
        matchers: [{ kind: "contains", value: "abc123" }],
      }),
    ]);
  });

  it("rejects the removed legacy function syntax", async () => {
    const { add } = await import("src/core/NG");
    await expect(add("ID(value=abc123)")).rejects.toThrow("新しいブロックDSL");
  });
});

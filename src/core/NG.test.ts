import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const configStore = new Map<string, string>();

vi.mock("src/core/jsutil", () => ({
  normalize: (value: string) => value.toLowerCase(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => configStore.get(key) ?? null,
      set: (key: string, value: string) => {
        configStore.set(key, value);
        return Promise.resolve();
      },
    },
    toast: { notify: vi.fn() },
    message: { send: vi.fn() },
  },
}));

describe("NG Rule service", () => {
  beforeEach(() => configStore.clear());

  it("loads only the block DSL and applies title/body rules", async () => {
    configStore.set(
      "ngwords",
      `highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  注目

hide body regex:
  "(imgur\\.com/.+?){15}"`,
    );
    const { get, invalidateCache, isNGBoard, isNGThread } = await import("src/core/NG");
    invalidateCache();

    expect(get()).toHaveLength(2);
    expect(isNGBoard("注目スレ", "https://bbs.eddibb.cc/test/1", 10)).toMatchObject({
      type: "HighlightTitle",
      params: { bgColor: "blue", label: "注目" },
    });
    expect(
      isNGThread(
        {
          num: 1,
          name: "name",
          mail: "",
          message: Array.from({ length: 15 }, () => "imgur.com/a").join(" "),
        },
        "title",
        "https://bbs.eddibb.cc/test/1",
      ),
    ).toMatchObject({
      type: "RegExpBody",
      ruleDescription: `hide body regex:\n  "(imgur\\.com/.+?){15}"`,
    });
  });

  it("rejects the removed function-style syntax", async () => {
    const { set } = await import("src/core/NG");
    await expect(set("Body(value=荒らし)")).rejects.toThrow("新しいブロックDSL");
  });

  it("distinguishes demoted board threads from hidden board threads", async () => {
    const { apply, invalidateCache, isNGBoard } = await import("src/core/NG");
    invalidateCache();
    apply(`demote title contains:\n  薄くする\n\nhide title contains:\n  隠す`);

    expect(isNGBoard("薄くするスレ", "https://example.com/board/", 1)).toMatchObject({
      action: "demote",
    });
    expect(isNGBoard("隠すスレ", "https://example.com/board/", 1)).toMatchObject({
      action: "hide",
    });
  });

  it("applies a stored DSL without writing it back", async () => {
    const { apply, get, invalidateCache } = await import("src/core/NG");
    invalidateCache();
    apply("hide body contains:\n  保存済み");

    expect(configStore.has("ngwords")).toBe(false);
    expect(get()).toEqual([
      expect.objectContaining({
        action: "hide",
        target: "body",
        matchers: [{ kind: "contains", value: "保存済み" }],
      }),
    ]);
  });

  it("matches anchor-count from the response body", async () => {
    const { apply, invalidateCache, isNGThread } = await import("src/core/NG");
    invalidateCache();
    apply("hide anchor-count >= 2:");

    expect(
      isNGThread(
        {
          num: 2,
          name: "name",
          mail: "",
          message: "&gt;&gt;1 &gt;&gt;1,3",
        },
        "title",
        "https://bbs.eddibb.cc/test/1",
      ),
    ).toMatchObject({ type: "AnchorCount" });
  });

  it("表示可能な画像URLの重複を除いて画像数NGを適用する", async () => {
    const { apply, invalidateCache, isNGThread } = await import("src/core/NG");
    invalidateCache();
    apply("hide image-count >= 2:");

    expect(
      isNGThread(
        {
          num: 2,
          name: "name",
          mail: "",
          message: [
            "https://example.com/first.jpg",
            "https://example.com/first.jpg",
            "https://example.com/second.png",
            "https://example.com/movie.mp4",
            "https://imgur.com/a/album-id",
          ].join(" "),
        },
        "title",
        "https://example.com/thread/1",
      ),
    ).toMatchObject({ type: "ImageCount", ruleDescription: "hide image-count >= 2:" });
  });

  it("画像数が閾値未満なら画像数NGを適用しない", async () => {
    const { apply, invalidateCache, isNGThread } = await import("src/core/NG");
    invalidateCache();
    apply("hide image-count >= 2:");

    expect(
      isNGThread(
        {
          num: 3,
          name: "name",
          mail: "",
          message: "https://example.com/only-image.jpg https://youtu.be/video",
        },
        "title",
        "https://example.com/thread/1",
      ),
    ).toBeNull();
  });
});

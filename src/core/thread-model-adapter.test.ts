import { describe, expect, it } from "vite-plus/test";
import { fromCanonicalThread, toCanonicalThread } from "src/core/thread-model-adapter";

describe("thread model adapter", () => {
  it("converts legacy res fields into the canonical IThread/IRes shape", () => {
    const canonical = toCanonicalThread({
      title: "タイトル",
      res: [
        {
          name: "名前</b>◆trip<b>",
          mail: "sage",
          message: "本文",
          other: "2026/08/23(土) 12:00:00 ID:abc BE:123-ABC(1)",
        },
      ],
    });

    expect(canonical).toEqual({
      title: "タイトル",
      posts: [
        {
          number: 1,
          name: "名前</b>◆trip<b>",
          mail: "sage",
          date: "2026/08/23(土) 12:00:00 ID:abc BE:123-ABC(1)",
          message: "本文",
          other: "2026/08/23(土) 12:00:00 ID:abc BE:123-ABC(1)",
          id: "abc",
          trip: "◆trip",
          be: "BE:123-ABC(1)",
        },
      ],
    });
  });

  it("round-trips canonical snapshots back to the legacy cache shape", () => {
    const legacy = fromCanonicalThread({
      title: "タイトル",
      posts: [
        {
          number: 7,
          name: "名前",
          mail: "",
          date: "2026/08/23",
          message: "本文",
        },
      ],
    });

    expect(legacy).toEqual({
      title: "タイトル",
      res: [{ name: "名前", mail: "", message: "本文", other: "2026/08/23" }],
    });
  });

  it("preserves an ID extracted directly from HTML metadata", () => {
    const canonical = toCanonicalThread({
      res: [
        {
          name: "名前",
          mail: "",
          message: "本文",
          other: "2026/08/23(土) 12:00:00",
          id: "html-id",
        },
      ],
    });

    expect(canonical.posts[0].id).toBe("html-id");
  });
});

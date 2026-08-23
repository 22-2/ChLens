import { describe, expect, it } from "vite-plus/test";
import { createChLensLiveSource, type ChLensLiveFetcher } from "./source";

describe("ChLens Live source boundary", () => {
  it("delegates board and thread loading to ch-lib without importing it into the UI", async () => {
    const fetcher: ChLensLiveFetcher = {
      fetchBoard: async () => [
        {
          url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000001/",
          title: "テスト",
          resCount: 2,
          createdAt: 1000000001000,
        },
      ],
      fetchThread: async () => ({ title: "テスト", posts: [] }),
    };
    const source = createChLensLiveSource(fetcher);

    await expect(source.loadBoard("https://bbs.eddibb.cc/liveedge/")).resolves.toHaveLength(1);
    await expect(source.loadThread("https://bbs.eddibb.cc/liveedge/1000000001/")).resolves.toEqual({
      title: "テスト",
      posts: [],
    });
  });
});

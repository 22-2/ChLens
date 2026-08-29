import { describe, expect, it } from "vite-plus/test";
import {
  createChLensLiveSource,
  createTauriChLensLiveSource,
  type ChLensLiveFetcher,
} from "./source";

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
      fetchBoardWithMetadata: async () => ({
        data: [],
        metadata: { bodyBytes: 0 },
      }),
      fetchThread: async () => ({ title: "テスト", posts: [] }),
      fetchThreadWithMetadata: async () => ({
        data: { title: "テスト", posts: [] },
        metadata: { bodyBytes: 0, parsedResCount: 0 },
      }),
    };
    const source = createChLensLiveSource(fetcher);

    await expect(source.loadBoard("https://bbs.eddibb.cc/liveedge/")).resolves.toHaveLength(1);
    await expect(source.loadThread("https://bbs.eddibb.cc/liveedge/1000000001/")).resolves.toEqual({
      title: "テスト",
      posts: [],
    });
    await expect(
      source.loadThreadWithMetadata("https://bbs.eddibb.cc/liveedge/1000000001/"),
    ).resolves.toMatchObject({ metadata: { bodyBytes: 0 } });
  });

  it("exposes a Tauri composition factory without changing the source boundary", () => {
    const source = createTauriChLensLiveSource();

    expect(source).toEqual({
      loadBoard: expect.any(Function),
      loadBoardWithMetadata: expect.any(Function),
      loadBoardTitle: expect.any(Function),
      loadThread: expect.any(Function),
      loadThreadWithMetadata: expect.any(Function),
    });
  });
});

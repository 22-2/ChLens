import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { fetchMock, cache } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  cache: {
    data: "1000000001.dat<>古いスレ一覧 (1)\n",
    lastUpdated: 0,
    lastModified: null as number | null,
    etag: null as string | null,
    get: vi.fn(async () => {}),
    put: vi.fn(async () => {}),
  },
}));

vi.mock("src/app", () => ({
  platform: {
    http: {
      fetch: fetchMock,
    },
  },
}));

vi.mock("src/core/jsutil", () => ({
  chServerMoveDetect: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    bookmark: {
      getByBoard: vi.fn(() => []),
      updateExpired: vi.fn(),
      updateResCount: vi.fn(),
    },
    cache: {
      getCache: vi.fn(() => cache),
    },
    ng: {
      isNGBoard: vi.fn(() => null),
    },
  },
}));

import Board from "src/core/Board";

describe("Board.getCachedResCount", () => {
  beforeEach(() => {
    cache.data = "1000000001.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = 0;
    cache.get.mockReset();
    cache.get.mockResolvedValue(undefined);
    fetchMock.mockReset();
  });

  it("板キャッシュがなくても最新一覧からスレッドの存在を確認する", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://example.com/board/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://example.com/test/read.cgi/board/1000000002/",
      { forceUpdate: true },
    );

    expect(result.resCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("板キャッシュがなくても最新一覧から消えたスレッドを検知する", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://example.com/board/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", {
        forceUpdate: true,
      }),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("板キャッシュも通信結果もない場合はスレッド不在と誤判定しない", async () => {
    cache.get.mockRejectedValue(new Error("キャッシュ未取得"));
    fetchMock.mockRejectedValue(new Error("通信に失敗しました"));

    await expect(
      Board.getCachedResCount("https://example.com/test/read.cgi/board/1000000002/", {
        forceUpdate: true,
      }),
    ).rejects.not.toThrow("板のスレ一覧にそのスレが存在しません");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("板キャッシュが解析不能でも短時間キャッシュへ戻らず最新一覧を確認する", async () => {
    cache.lastUpdated = Date.now();
    const parseSpy = vi.spyOn(Board, "parse").mockReturnValueOnce(null);
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://example.com/board/subject.txt",
    });

    try {
      const result = await Board.getCachedResCount(
        "https://example.com/test/read.cgi/board/1000000002/",
      );
      expect(result.resCount).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("confirms a cached subject miss against a freshly fetched subject", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000002.dat<>現在のスレ一覧 (2)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://egg.5ch.io/test/read.cgi/software/1000000002/",
    );

    expect(result.resCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports not_found only after the refreshed subject also lacks the thread", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://egg.5ch.io/test/read.cgi/software/1000000002/"),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
  });

  it("強制更新時はキャッシュ上で見つかるスレッドもsubject.txtで再確認する", async () => {
    cache.data = "1000000002.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = Date.now();
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>現在のスレ一覧 (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://egg.5ch.io/test/read.cgi/software/1000000003/",
      { forceUpdate: true },
    );

    expect(result.resCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("強制更新でsubject.txtから消えたスレッドを検知する", async () => {
    cache.data = "1000000002.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = Date.now();
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>別のスレッド (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://egg.5ch.io/test/read.cgi/software/1000000002/", {
        forceUpdate: true,
      }),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
  });
});

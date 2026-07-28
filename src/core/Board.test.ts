import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { fetchMock, cache } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  cache: {
    data: "1000000002.dat<>古いスレ一覧 (1)\n",
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
    cache.data = "1000000002.dat<>古いスレ一覧 (1)\n";
    cache.lastUpdated = 0;
    fetchMock.mockReset();
  });

  it("confirms a cached subject miss against a freshly fetched subject", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000003.dat<>現在のスレ一覧 (2)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    const result = await Board.getCachedResCount(
      "https://egg.5ch.io/test/read.cgi/software/1000000003/",
    );

    expect(result.resCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports not_found only after the refreshed subject also lacks the thread", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "1000000004.dat<>別のスレッド (3)\n",
      url: "https://egg.5ch.io/software/subject.txt",
    });

    await expect(
      Board.getCachedResCount("https://egg.5ch.io/test/read.cgi/software/1000000003/"),
    ).rejects.toThrow("板のスレ一覧にそのスレが存在しません");
  });
});

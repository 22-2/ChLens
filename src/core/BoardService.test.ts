import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getCachedResCount: vi.fn(),
  getByBoard: vi.fn(),
  getBookmark: vi.fn(),
  isNewerReadState: vi.fn(),
}));

vi.mock("src/core/Board.js", () => ({
  default: {
    get: mocks.getBoard,
    getCachedResCount: mocks.getCachedResCount,
  },
}));

vi.mock("src/service-container/index", () => ({
  container: {
    readState: { getByBoard: mocks.getByBoard },
    bookmark: { get: mocks.getBookmark },
    util: { isNewerReadState: mocks.isNewerReadState },
  },
}));

import BoardService from "src/core/BoardService";

describe("BoardService canonical subject adapter", () => {
  it("エッヂの一覧URLを既読DBのURLへ揃えて既読情報を反映する", async () => {
    mocks.getBoard.mockResolvedValueOnce({
      status: "success",
      data: [
        {
          url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
          title: "スレッド",
          resCount: 4,
          createdAt: 1000,
          ng: null,
        },
      ],
    });
    const readState = {
      url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
      last: 2,
      read: 2,
      received: 4,
    };
    mocks.getByBoard.mockResolvedValueOnce([readState]);
    mocks.getBookmark.mockReturnValueOnce(undefined);

    await expect(BoardService.getThreads("https://bbs.eddibb.cc/liveedge/")).resolves.toEqual({
      threads: [
        {
          url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
          title: "スレッド",
          resCount: 4,
          createdAt: 1000,
          ng: null,
          demoted: undefined,
          highlight: undefined,
          isNet: undefined,
          readState,
          threadNumber: 0,
        },
      ],
      message: null,
    });
    expect(mocks.getByBoard).toHaveBeenCalledWith("http://bbs.eddibb.cc/liveedge/");
  });
});

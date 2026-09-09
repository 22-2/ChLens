import { describe, expect, it, vi } from "vite-plus/test";
import type { HttpResponse } from "src/app/platform/types";
import type { ParsedThread } from "src/core/ThreadParser.js";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => null),
  getCache: vi.fn(() => ({})),
  updateResCount: vi.fn(),
  updateExpired: vi.fn(),
}));

vi.mock("src/app", () => ({
  platform: {},
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: mocks.getConfig },
    cache: { getCache: mocks.getCache },
    bookmark: {
      updateResCount: mocks.updateResCount,
      updateExpired: mocks.updateExpired,
    },
  },
}));

vi.mock("src/core/jsutil.js", () => ({
  chServerMoveDetect: vi.fn(),
}));

import Thread from "src/core/Thread.js";

interface ThreadInternals {
  _buildDomainErrorMessage: () => Promise<string>;
  _doFetch: () => Promise<{
    response: HttpResponse;
    xhrPath: string;
    deltaFlg: boolean;
    readcgiVer: number;
  }>;
  _fetchCachedResCount: () => Promise<{ status: string }>;
  _parseResponseIntoThread: () => {
    thread: ParsedThread;
    noChangeFlg: boolean;
  };
  _prepareCache: () => Promise<{ hasCache: boolean; needFetch: boolean }>;
}

describe("Thread", () => {
  it("本文取得が失敗しても板一覧から消えていればsubject不在を返す", async () => {
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/");
    const testableThread = thread as unknown as ThreadInternals;
    const parsedThread = {
      title: "テストスレッド",
      res: [],
    } as ParsedThread;

    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: true,
      needFetch: true,
    });
    vi.spyOn(testableThread, "_fetchCachedResCount").mockResolvedValue({ status: "not_found" });
    vi.spyOn(testableThread, "_doFetch").mockResolvedValue({
      response: { status: 404, body: "" } as HttpResponse,
      xhrPath: "https://example.com/board/dat/1000000000.dat",
      deltaFlg: true,
      readcgiVer: 5,
    });
    vi.spyOn(testableThread, "_parseResponseIntoThread").mockReturnValue({
      thread: parsedThread,
      noChangeFlg: false,
    });
    vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("取得に失敗しました");

    // 変更理由: dat落ちのHTTPステータスはサーバーごとに異なるため、
    // 203以外の失敗でもsubject.txtの確認結果を停止判定へ残すことを回帰テストする。
    await expect(thread.get(true)).rejects.toBeUndefined();

    expect(thread.missingFromSubject).toBe(true);
  });
});

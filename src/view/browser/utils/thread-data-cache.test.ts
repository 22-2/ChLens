import type { IRes } from "src/service-container/interfaces";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getStoreMock, cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));

vi.mock("src/app", () => ({
  platform: {
    storage: {
      getStore: getStoreMock,
    },
  },
}));

import {
  getThreadResponseCache,
  setThreadResponseCache,
} from "src/view/browser/utils/thread-data-cache";

function response(num: number, synthetic = false): IRes {
  return {
    num,
    name: synthetic ? "あぼーん" : "名無し",
    mail: synthetic ? "あぼーん" : "",
    date: synthetic ? "" : "2026/09/12(土) 12:00:00.000",
    message: synthetic ? "あぼーん" : "本文",
    other: synthetic ? "あぼーん" : undefined,
  };
}

describe("スレッド表示キャッシュ", () => {
  beforeEach(() => {
    cacheGetMock.mockReset();
    cachePutMock.mockReset();
    getStoreMock.mockReturnValue({ get: cacheGetMock, put: cachePutMock });
  });

  it("読み込み時に末尾の一時的なあぼーん補填を除外する", async () => {
    const threadUrl = "https://example.com/test/read.cgi/example/1/";
    const actualResponse = response(1);
    cacheGetMock.mockResolvedValue({
      url: `thread:${threadUrl}`,
      data: [actualResponse, response(2, true)],
    });

    await expect(getThreadResponseCache(threadUrl)).resolves.toEqual([actualResponse]);
    expect(getStoreMock).toHaveBeenCalledWith("UICache");
  });

  it("保存時にも一時的なあぼーん補填を永続化しない", async () => {
    const threadUrl = "https://example.com/test/read.cgi/example/1/";
    const actualResponse = response(1);

    await setThreadResponseCache(threadUrl, [actualResponse, response(2, true)]);

    expect(cachePutMock).toHaveBeenCalledWith({
      url: `thread:${threadUrl}`,
      data: [actualResponse],
    });
  });
});

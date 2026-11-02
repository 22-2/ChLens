import { createBoardTitleRequest } from "packages/chlib/src/index";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { send, request } = vi.hoisted(() => ({ send: vi.fn(), request: vi.fn() }));
vi.mock("src/core/network/HTTP", () => ({
  Request: class {
    constructor(...args: unknown[]) {
      request(...args);
    }
    send = send;
  },
}));
import { createBoardSettingFetcher } from "./BoardSettingFetcher";

const boardRequest = createBoardTitleRequest("https://example.com/board/")!;

describe("板設定の取得", () => {
  beforeEach(() => {
    request.mockReset();
    send.mockReset();
  });
  it("同時要求とTTL内の再要求は1回の通信を共有し、forceなら取り直す", async () => {
    send.mockResolvedValue({ status: 200, body: "BBS_TITLE=テスト" });
    const fetcher = createBoardSettingFetcher();
    await Promise.all([fetcher.fetch(boardRequest), fetcher.fetch(boardRequest)]);
    await fetcher.fetch(boardRequest);
    expect(send).toHaveBeenCalledTimes(1);
    await fetcher.fetch(boardRequest, { force: true });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("SETTING.TXTが404なら小文字拡張子を試す", async () => {
    send
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 200, body: "BBS_RES_MAX=3000" });
    expect(await createBoardSettingFetcher().fetch(boardRequest)).toBe("BBS_RES_MAX=3000");
    expect(request.mock.calls[1]?.[1]).toBe("https://example.com/board/SETTING.txt");
  });
  it("設定がない板は負キャッシュし、通信失敗は次回に取り直す", async () => {
    send.mockResolvedValue({ status: 404 });
    const fetcher = createBoardSettingFetcher();
    await expect(fetcher.fetch(boardRequest)).rejects.toThrow("HTTP 404");
    await expect(fetcher.fetch(boardRequest)).rejects.toThrow("HTTP 404");
    expect(send).toHaveBeenCalledTimes(2); // 大文字・小文字の2回分で、2回目の要求は通信しない

    send.mockReset().mockRejectedValueOnce(new Error("通信失敗")).mockResolvedValueOnce({
      status: 200,
      body: "ok",
    });
    const other = createBoardSettingFetcher();
    await expect(other.fetch(boardRequest)).rejects.toThrow("通信失敗");
    expect(await other.fetch(boardRequest)).toBe("ok");
  });
});

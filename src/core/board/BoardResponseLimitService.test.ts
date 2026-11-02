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
import { createBoardResponseLimitService } from "./BoardResponseLimitService";

describe("板のレス上限サービス", () => {
  beforeEach(() => {
    request.mockReset();
    send.mockReset();
  });
  it("SETTING.TXTが存在しない場合は小文字拡張子を試し、同一板の結果を共有する", async () => {
    send
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 200, body: "BBS_RES_MAX=3000" });
    const service = createBoardResponseLimitService();
    const thread = "https://example.com/test/read.cgi/board/123/";
    expect(await Promise.all([service.get(thread), service.get(thread)])).toEqual([3000, 3000]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toBe("https://example.com/board/SETTING.txt");
    expect(await service.get(thread)).toBe(3000);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("上限未掲載の5chとエッヂは既定の1000を使い、その他の板は推測しない", async () => {
    send.mockResolvedValue({ status: 200, body: "BBS_TITLE=テスト" });
    const service = createBoardResponseLimitService();
    expect(await service.get("https://server.5ch.io/test/read.cgi/sample/123/")).toBe(1000);
    expect(await service.get("https://bbs.eddibb.cc/test/read.cgi/sample/123/")).toBe(1000);
    expect(await service.get("https://example.com/test/read.cgi/sample/123/")).toBeNull();
  });
  it("失敗は不明として返し、次回は再取得する", async () => {
    send
      .mockRejectedValueOnce(new Error("通信失敗"))
      .mockResolvedValueOnce({ status: 200, body: "BBS_RES_MAX=3000" });
    const service = createBoardResponseLimitService();
    const thread = "https://example.com/test/read.cgi/board/123/";
    expect(await service.get(thread)).toBeNull();
    expect(await service.get(thread)).toBe(3000);
  });
});

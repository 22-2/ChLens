import { clearCachedThreadReadState } from "src/features/thread-list/ui/thread-list-cache";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cacheMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("src/features/thread-list/ui/thread-list-shared", () => ({
  getThreadListCache: cacheMocks.get,
  setThreadListCache: cacheMocks.set,
}));

describe("スレ一覧キャッシュ", () => {
  beforeEach(() => {
    cacheMocks.get.mockReset();
    cacheMocks.set.mockReset();
    cacheMocks.set.mockResolvedValue(undefined);
  });

  it("指定したスレの既読状態だけをキャッシュから外す", async () => {
    const targetUrl = "https://example.com/test/read.cgi/board/1/";
    const otherUrl = "https://example.com/test/read.cgi/board/2/";
    cacheMocks.get.mockResolvedValue([
      { url: targetUrl, readState: { read: 2, received: 3 } },
      { url: otherUrl, readState: { read: 1, received: 1 } },
    ]);

    await clearCachedThreadReadState(targetUrl);

    expect(cacheMocks.get).toHaveBeenCalledWith("https://example.com/board/");
    expect(cacheMocks.set).toHaveBeenCalledWith("https://example.com/board/", [
      { url: targetUrl, readState: undefined },
      { url: otherUrl, readState: { read: 1, received: 1 } },
    ]);
  });

  it("対象の一覧キャッシュがなければ何も書き込まない", async () => {
    cacheMocks.get.mockResolvedValue(null);

    await clearCachedThreadReadState("https://example.com/test/read.cgi/board/1/");

    expect(cacheMocks.set).not.toHaveBeenCalled();
  });
});

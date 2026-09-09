import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  isNGThread: vi.fn(),
  threadGet: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    ng: {
      isNGThread: mocks.isNGThread,
    },
  },
}));

vi.mock("src/core/Thread.js", () => ({
  default: class Thread {
    title = "テストスレッド";
    res = [];
    expired = false;
    missingFromSubject = false;
    url: { url: { href: string } };

    constructor(url: string) {
      this.url = { url: { href: url } };
    }

    get(forceUpdate: boolean, progress: () => void): Promise<void> {
      return mocks.threadGet(forceUpdate, progress);
    }
  },
}));

interface FormattedResponse {
  ng?: unknown;
  id?: string;
  date?: string;
}

interface ThreadServiceLike {
  _formatResult(thread: unknown): { res: FormattedResponse[] };
  getThread(
    url: string,
    options?: { forceUpdate?: boolean; onCache?: (thread: unknown) => void },
  ): Promise<unknown>;
}

describe("ThreadService", () => {
  beforeEach(() => {
    mocks.isNGThread.mockReset();
    mocks.threadGet.mockReset();
  });

  it("同じタイミングの同一URL取得を強制更新1本へ集約する", async () => {
    let resolveFetch: (() => void) | undefined;
    let progress: (() => void) | undefined;
    mocks.threadGet.mockImplementationOnce((forceUpdate: boolean, onProgress: () => void) => {
      expect(forceUpdate).toBe(true);
      progress = onProgress;
      return new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const firstCache = vi.fn();
    const secondCache = vi.fn();
    const { default: threadService } = await import("src/core/ThreadService.js");
    const service = threadService as unknown as ThreadServiceLike;
    const url = "https://example.com/test/read.cgi/board/1000000000/";

    // 変更理由: 本文と勢いのeffect順が変わっても、同じmicrotask内のforceUpdateを
    // 強い条件へ統合し、通常取得が先行しただけで二重通信にならないことを固定する。
    const first = service.getThread(url, { forceUpdate: false, onCache: firstCache });
    const second = service.getThread(url, { forceUpdate: true, onCache: secondCache });
    await vi.waitFor(() => expect(mocks.threadGet).toHaveBeenCalledOnce());

    progress?.();
    expect(firstCache).toHaveBeenCalledOnce();
    expect(secondCache).toHaveBeenCalledOnce();
    resolveFetch?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    mocks.threadGet.mockResolvedValueOnce(undefined);
    await service.getThread(url);
    expect(mocks.threadGet).toHaveBeenCalledTimes(2);
  });

  it("builds the full reply index before applying response NG", async () => {
    mocks.isNGThread.mockImplementation((res: { replyCount?: number }) =>
      res.replyCount != null && res.replyCount >= 2 ? { type: "ReplyCount" } : null,
    );

    const { default: threadService } = await import("src/core/ThreadService.js");
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        { name: "", mail: "", message: "本文", other: "" },
        { name: "", mail: "", message: "&gt;&gt;1", other: "" },
        { name: "", mail: "", message: "&gt;&gt;1", other: "" },
      ],
    });

    expect(result.res[0]?.ng).toEqual({ type: "ReplyCount" });
    expect(result.res[1]?.ng).toBeUndefined();
    expect(result.res[2]?.ng).toBeUndefined();
    expect(mocks.isNGThread).toHaveBeenCalledTimes(3);
    expect(mocks.isNGThread).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ replyCount: 0, anchorCount: 1 }),
      "title",
      "https://example.com/test/read.cgi/board/1/",
    );
  });

  it("keeps an ID extracted directly from the HTML post when metadata differs", async () => {
    const { default: threadService } = await import("src/core/ThreadService.js");
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        {
          name: "",
          mail: "",
          message: "本文",
          other: "2026/08/27(木) 12:00:00.00 ID:from-metadata",
          id: "from-attribute",
        },
      ],
    });

    expect(result.res[0]?.id).toBe("from-attribute");
  });

  it("extracts a timestamp when a dat uses a multi-character weekday", async () => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(now);
    const timestamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}(${weekday}) ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}.${String(now.getUTCMilliseconds()).padStart(3, "0")}`;

    const { default: threadService } = await import("src/core/ThreadService.js");
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [{ name: "", mail: "", message: "", other: timestamp }],
    });

    expect(result.res[0]?.date).toBe(timestamp);
  });
});

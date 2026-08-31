import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  isNGThread: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    ng: {
      isNGThread: mocks.isNGThread,
    },
  },
}));

vi.mock("src/core/Thread.js", () => ({
  default: class Thread {},
}));

interface FormattedResponse {
  ng?: unknown;
  id?: string;
  date?: string;
}

interface ThreadServiceLike {
  _formatResult(thread: unknown): { res: FormattedResponse[] };
}

describe("ThreadService", () => {
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

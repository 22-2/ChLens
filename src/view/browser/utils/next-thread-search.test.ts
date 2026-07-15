import type { IThread } from "src/service-container/interfaces";
import {
  findMainstreamThreadMatch,
  findNextThreadMatch,
} from "src/view/browser/utils/next-thread-search";
import { describe, expect, it } from "vite-plus/test";

function createThread(
  overrides: Partial<IThread> & Pick<IThread, "title" | "url" | "resCount" | "createdAt">,
): IThread {
  return {
    title: overrides.title,
    url: overrides.url,
    resCount: overrides.resCount,
    createdAt: overrides.createdAt,
    ng: undefined,
    highlight: undefined,
    isNet: null,
    readState: undefined,
    threadNumber: overrides.threadNumber,
  };
}

describe("next-thread-search", () => {
  it("番号と類似度が近い候補を次スレとして選ぶ", () => {
    const currentThread = {
      title: "実況スレ Part.10",
      url: "https://example.com/test/read.cgi/live/1700000010/",
    };
    const threads = [
      createThread({
        title: "実況スレ Part.11",
        url: "https://example.com/test/read.cgi/live/1700000011/",
        resCount: 12,
        createdAt: 1_700_000_011_000,
      }),
      createThread({
        title: "別番組 Part.99",
        url: "https://example.com/test/read.cgi/live/1700000099/",
        resCount: 12,
        createdAt: 1_700_000_099_000,
      }),
    ];

    const match = findNextThreadMatch(threads, currentThread);

    expect(match?.reason).toBe("number");
    expect(match?.thread.url).toBe("https://example.com/test/read.cgi/live/1700000011/");
  });

  it("通常候補が見つからない時は反省会スレをフォールバック候補にする", () => {
    const currentThread = {
      title: "番組実況スペシャル",
      url: "https://example.com/test/read.cgi/live/1700000020/",
    };
    const threads = [
      createThread({
        title: "番組実況スペシャル 反省会",
        url: "https://example.com/test/read.cgi/live/1700000021/",
        resCount: 44,
        createdAt: 1_700_000_021_000,
      }),
      createThread({
        title: "まったく関係ない雑談スレ",
        url: "https://example.com/test/read.cgi/live/1700000022/",
        resCount: 44,
        createdAt: 1_700_000_022_000,
      }),
    ];

    const match = findNextThreadMatch(threads, currentThread);

    expect(match?.reason).toBe("reflection");
    expect(match?.thread.title).toContain("反省会");
  });

  it("●付きスレは最新の●候補を優先する", () => {
    const currentThread = {
      title: "●実況スレ",
      url: "https://example.com/test/read.cgi/live/1700000030/",
    };
    const threads = [
      createThread({
        title: "●実況スレ",
        url: "https://example.com/test/read.cgi/live/1700000031/",
        resCount: 100,
        createdAt: 1_700_000_031_000,
      }),
      createThread({
        title: "●実況スレ",
        url: "https://example.com/test/read.cgi/live/1700000032/",
        resCount: 100,
        createdAt: 1_700_000_032_000,
      }),
    ];

    const match = findNextThreadMatch(threads, currentThread);

    expect(match?.reason).toBe("mark");
    expect(match?.thread.url).toBe("https://example.com/test/read.cgi/live/1700000032/");
  });

  it("本流監視では勢い差が大きい候補だけを拾う", () => {
    const now = 1_700_100_000_000;
    const threads = [
      createThread({
        title: "実況スレ Part.10",
        url: "https://example.com/test/read.cgi/live/1700000100/",
        resCount: 1000,
        createdAt: now - 5 * 60 * 60 * 1000,
      }),
      createThread({
        title: "実況スレ Part.11",
        url: "https://example.com/test/read.cgi/live/1700000101/",
        resCount: 60,
        createdAt: now - 3 * 60 * 60 * 1000,
      }),
      createThread({
        title: "実況スレ Part.11",
        url: "https://example.com/test/read.cgi/live/1700000102/",
        resCount: 220,
        createdAt: now - 3 * 60 * 60 * 1000,
      }),
    ];

    const match = findMainstreamThreadMatch(threads, {
      originalThreadUrl: "https://example.com/test/read.cgi/live/1700000100/",
      originalThreadTitle: "実況スレ Part.10",
      currentThreadUrl: "https://example.com/test/read.cgi/live/1700000101/",
      now,
    });

    expect(match?.reason).toBe("mainstream");
    expect(match?.thread.url).toBe("https://example.com/test/read.cgi/live/1700000102/");
  });
});

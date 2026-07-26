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

  it("積極判定では通常候補がない時に反省会スレを候補にする", () => {
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

    const match = findNextThreadMatch(threads, currentThread, {
      mode: "aggressive",
    });

    expect(match?.reason).toBe("reflection");
    expect(match?.thread.title).toContain("反省会");
  });

  it("積極判定では同名の●付きスレから最新候補を選ぶ", () => {
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

    const match = findNextThreadMatch(threads, currentThread, {
      mode: "aggressive",
    });

    expect(match?.reason).toBe("mark");
    expect(match?.thread.url).toBe("https://example.com/test/read.cgi/live/1700000032/");
  });

  it("●付きという理由だけで無関係なスレを選ばない", () => {
    const currentThread = {
      title: "●サッカー日本代表実況",
      url: "https://example.com/test/read.cgi/live/1700000030/",
    };
    const threads = [
      createThread({
        title: "●競馬予想雑談",
        url: "https://example.com/test/read.cgi/live/1700000031/",
        resCount: 100,
        createdAt: 1_700_000_031_000,
      }),
    ];

    expect(findNextThreadMatch(threads, currentThread, { mode: "aggressive" })).toBeNull();
  });

  it("標準判定では現在より若いPart番号へ戻らない", () => {
    const currentThread = {
      title: "実況スレ Part.10",
      url: "https://example.com/test/read.cgi/live/1700000100/",
    };
    const threads = [
      createThread({
        title: "実況スレ Part.9",
        url: "https://example.com/test/read.cgi/live/1700000101/",
        resCount: 100,
        createdAt: 1_700_000_101_000,
      }),
    ];

    expect(findNextThreadMatch(threads, currentThread, { mode: "balanced" })).toBeNull();
  });

  it("標準判定では有力候補が同点なら自動選択しない", () => {
    const currentThread = {
      title: "番組実況",
      url: "https://example.com/test/read.cgi/live/1700000200/",
    };
    const threads = [
      createThread({
        title: "番組実況 次スレ候補A",
        url: "https://example.com/test/read.cgi/live/1700000201/",
        resCount: 20,
        createdAt: 1_700_000_201_000,
      }),
      createThread({
        title: "番組実況 次スレ候補B",
        url: "https://example.com/test/read.cgi/live/1700000202/",
        resCount: 20,
        createdAt: 1_700_000_202_000,
      }),
    ];

    expect(findNextThreadMatch(threads, currentThread, { mode: "balanced" })).toBeNull();
  });

  it("積極判定だけがタイトルの大きく変わった連番候補を許容する", () => {
    const currentThread = {
      title: "日本対ドイツ 前半実況 Part.1",
      url: "https://example.com/test/read.cgi/live/1700000250/",
    };
    const threads = [
      createThread({
        title: "逆転ｷﾀ━━ 後半戦 Part.2",
        url: "https://example.com/test/read.cgi/live/1700000251/",
        resCount: 30,
        createdAt: 1_700_000_251_000,
      }),
    ];

    expect(findNextThreadMatch(threads, currentThread, { mode: "balanced" })).toBeNull();
    expect(findNextThreadMatch(threads, currentThread, { mode: "aggressive" })?.thread.url).toBe(
      "https://example.com/test/read.cgi/live/1700000251/",
    );
  });

  it("スレタイが変化しても本文で次スレと案内されたURLを優先する", () => {
    const currentThread = {
      title: "日本対ドイツ 前半実況",
      url: "https://example.com/test/read.cgi/live/1700000300/",
    };
    const expectedUrl = "https://example.com/test/read.cgi/live/1700000301/";
    const threads = [
      createThread({
        title: "日本逆転ｷﾀ━━ 後半戦",
        url: expectedUrl,
        resCount: 24,
        createdAt: 1_700_000_301_000,
      }),
      createThread({
        title: "日本対ドイツ 前半実況の感想",
        url: "https://example.com/test/read.cgi/live/1700000302/",
        resCount: 24,
        createdAt: 1_700_000_302_000,
      }),
    ];

    const match = findNextThreadMatch(threads, currentThread, {
      mode: "cautious",
      responseMessages: [`次スレはこちら <a href="${expectedUrl}">${expectedUrl}</a>`],
    });

    expect(match?.thread.url).toBe(expectedUrl);
    expect(match?.reasons).toContain("explicit-link");
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

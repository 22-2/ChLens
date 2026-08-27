import type { IThread } from "src/service-container/interfaces";
import {
  calculateTitleSimilarity,
  findMainstreamThreadMatch,
  findNextThreadCandidates,
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

  it("積極判定ではsubject.txt由来の見た目が似た文字のスレタイも拾う", () => {
    const standardTitle = "【NTV】金曜ロードショー「となりのトトロ」★8";
    const lookalikeTitle = "【NTV】金曜口一ドショ一「となりの卜卜口」★8";
    const currentThread = {
      title: "【NTV】金曜口一ドショ一「となりの卜卜口」★7",
      url: "https://example.com/test/read.cgi/live/1700000600/",
    };
    const expectedUrl = "https://example.com/test/read.cgi/live/1700000602/";
    const threads = [
      createThread({
        title: standardTitle,
        url: expectedUrl,
        resCount: 593,
        createdAt: 1_700_000_602_000,
      }),
      createThread({
        title: lookalikeTitle.replace("★8", "★7"),
        url: "https://example.com/test/read.cgi/live/1700000601/",
        resCount: 1001,
        createdAt: 1_700_000_601_000,
      }),
    ];

    expect(calculateTitleSimilarity(standardTitle, lookalikeTitle)).toBeGreaterThanOrEqual(0.75);
    expect(findNextThreadMatch(threads, currentThread, { mode: "aggressive" })?.thread.url).toBe(
      expectedUrl,
    );
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

  it("積極判定では連番スレから番号なしの反省会スレを候補にする", () => {
    const currentThread = {
      title: "【NTV】金曜ロードショー「となりのトトロ」★12",
      url: "https://example.com/test/read.cgi/live/1700000120/",
    };
    const reflectionUrl = "https://example.com/test/read.cgi/live/1700000121/";
    const threads = [
      createThread({
        title: "【NTV】金曜ロードショー「となりのトトロ」★反省会",
        url: reflectionUrl,
        resCount: 42,
        createdAt: 1_700_000_121_000,
      }),
    ];

    const match = findNextThreadMatch(threads, currentThread, {
      mode: "aggressive",
    });

    expect(match?.reason).toBe("reflection");
    expect(match?.thread.url).toBe(reflectionUrl);
    expect(findNextThreadMatch(threads, currentThread, { mode: "balanced" })).toBeNull();
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

  it("積極判定の候補をすべて返し、自動選択の同点制限を適用しない", () => {
    const currentThread = {
      title: "番組実況 2026",
      url: "https://example.com/test/read.cgi/live/1700000220/",
    };
    const threads = [
      createThread({
        title: "番組実況 2026 後編A",
        url: "https://example.com/test/read.cgi/live/1700000221/",
        resCount: 20,
        createdAt: 1_700_000_221_000,
      }),
      createThread({
        title: "番組実況 2026 後編B",
        url: "https://example.com/test/read.cgi/live/1700000222/",
        resCount: 20,
        createdAt: 1_700_000_222_000,
      }),
    ];

    const candidates = findNextThreadCandidates(threads, currentThread, {
      mode: "aggressive",
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.thread.url)).toEqual([
      "https://example.com/test/read.cgi/live/1700000221/",
      "https://example.com/test/read.cgi/live/1700000222/",
    ]);
    expect(findNextThreadMatch(threads, currentThread, { mode: "balanced" })).toBeNull();
  });

  it("手動検索ではレス数を優先し、自動追従ではスコア順を維持する", () => {
    const currentThread = {
      title: "実況スレ Part.10",
      url: "https://example.com/test/read.cgi/live/1700000230/",
    };
    const threads = [
      createThread({
        title: "実況スレ Part.11",
        url: "https://example.com/test/read.cgi/live/1700000231/",
        resCount: 20,
        createdAt: 1_700_000_231_000,
      }),
      createThread({
        title: "実況スレ Part.12",
        url: "https://example.com/test/read.cgi/live/1700000232/",
        resCount: 200,
        createdAt: 1_700_000_232_000,
      }),
    ];

    const candidates = findNextThreadCandidates(threads, currentThread, {
      mode: "aggressive",
    });

    expect(candidates.map((candidate) => candidate.thread.url)).toEqual([
      "https://example.com/test/read.cgi/live/1700000232/",
      "https://example.com/test/read.cgi/live/1700000231/",
    ]);
    expect(findNextThreadMatch(threads, currentThread, { mode: "aggressive" })?.thread.url).toBe(
      "https://example.com/test/read.cgi/live/1700000231/",
    );
  });

  it("手動検索でレス数が同じ場合は既存のスコア順を維持する", () => {
    const currentThread = {
      title: "実況スレ Part.10",
      url: "https://example.com/test/read.cgi/live/1700000240/",
    };
    const threads = [
      createThread({
        title: "実況スレ Part.11",
        url: "https://example.com/test/read.cgi/live/1700000241/",
        resCount: 200,
        createdAt: 1_700_000_241_000,
      }),
      createThread({
        title: "実況スレ Part.12",
        url: "https://example.com/test/read.cgi/live/1700000242/",
        resCount: 200,
        createdAt: 1_700_000_242_000,
      }),
    ];

    const candidates = findNextThreadCandidates(threads, currentThread, {
      mode: "aggressive",
    });

    expect(candidates.map((candidate) => candidate.thread.url)).toEqual([
      "https://example.com/test/read.cgi/live/1700000241/",
      "https://example.com/test/read.cgi/live/1700000242/",
    ]);
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

  it("映像の世紀スレの候補が重複する場合の標準判定結果を確認する", () => {
    const titles = [
      "【映像の世紀】第二次世界大戦（4）地獄 1944－49",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－49",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－48",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－48",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－47",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－46",
      "【映像の世紀】第二次世界大戦（4）地獄 1944－45",
    ];
    const threads = titles.map((title, index) =>
      createThread({
        title,
        url: `http://bbs.eddibb.cc/test/read.cgi/liveedge/${[22, 23, 25, 26, 27, 29, 31][index]}/`,
        resCount: 20,
        createdAt: 1_700_000_000_000 + index,
      }),
    );

    const expectedNextUrls = [23, 25, 26, 27, 29, 31, null].map((number) =>
      number == null ? null : `http://bbs.eddibb.cc/test/read.cgi/liveedge/${number}/`,
    );

    for (const [index, currentThread] of threads.entries()) {
      const match = findNextThreadMatch(threads, currentThread, { mode: "balanced" });

      expect(match?.thread.url ?? null).toBe(expectedNextUrls[index]);
    }
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

  it("本流監視では板一覧のレス増加量と隣接数値を使う", () => {
    const now = 1_700_100_000_000;
    const currentUrl = "http://bbs.eddibb.cc/test/read.cgi/liveedge/23/";
    const candidateUrl = "http://bbs.eddibb.cc/test/read.cgi/liveedge/25/";
    const threads = [
      createThread({
        title: "【映像の世紀】第二次世界大戦（4）地獄 1944－49",
        url: currentUrl,
        resCount: 1000,
        createdAt: now - 5 * 60 * 60 * 1000,
      }),
      createThread({
        title: "【映像の世紀】第二次世界大戦（4）地獄 1944－48",
        url: candidateUrl,
        resCount: 40,
        createdAt: now - 4 * 60 * 60 * 1000,
      }),
      createThread({
        title: "【映像の世紀】第二次世界大戦（4）地獄 1944－47",
        url: "http://bbs.eddibb.cc/test/read.cgi/liveedge/27/",
        resCount: 30,
        createdAt: now - 4 * 60 * 60 * 1000,
      }),
    ];
    const previousThreads = [
      { ...threads[0], resCount: 990 },
      { ...threads[1], resCount: 10 },
      { ...threads[2], resCount: 20 },
    ];

    const match = findMainstreamThreadMatch(threads, {
      originalThreadUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/22/",
      originalThreadTitle: "【映像の世紀】第二次世界大戦（4）地獄 1944－49",
      currentThreadUrl: currentUrl,
      previousThreads,
      previousObservedAt: now - 5_000,
      now,
    });

    expect(match?.thread.url).toBe(candidateUrl);
  });
});

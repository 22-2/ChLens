import type { IThread } from "src/service-container/interfaces";
import { DEFAULT_SEARCH_OPTIONS } from "src/view/browser/utils/search-normalize";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDisplayThreads,
  buildThreadSections,
  countThreadListFlags,
  filterVisibleThreads,
  getThreadRowClassName,
  nextSortPreference,
  resolveSortPreference,
} from "./thread-list-display";

function createThread(overrides: Partial<IThread> & { url: string }): IThread {
  return {
    title: "タイトル",
    resCount: 10,
    createdAt: 1_000,
    ...overrides,
  } as IThread;
}

describe("nextSortPreference", () => {
  it("別の列を選ぶと昇順から始める", () => {
    expect(nextSortPreference({ column: "title", direction: "desc" }, "heat")).toEqual({
      column: "heat",
      direction: "asc",
    });
  });

  it("同じ列を続けて選ぶと 昇順 → 降順 → 未ソート の順に進む", () => {
    const asc = nextSortPreference({ column: null, direction: "asc" }, "resCount");
    const desc = nextSortPreference(asc, "resCount");
    const none = nextSortPreference(desc, "resCount");
    expect([asc, desc, none]).toEqual([
      { column: "resCount", direction: "asc" },
      { column: "resCount", direction: "desc" },
      { column: null, direction: "asc" },
    ]);
  });
});

describe("resolveSortPreference", () => {
  it("保存された列が有効ならその列と向きを使う", () => {
    expect(resolveSortPreference("title", "desc", "https://example.com/board/")).toEqual({
      column: "title",
      direction: "desc",
    });
  });

  it("未ソートを選んだ保存値(null)は板別の設定で上書きしない", () => {
    expect(resolveSortPreference(null, undefined, "https://example.com/board/")).toEqual({
      column: null,
      direction: "asc",
    });
  });
});

describe("buildDisplayThreads", () => {
  const threads = [
    createThread({ url: "https://example.com/a", title: "いちご", resCount: 5 }),
    createThread({ url: "https://example.com/b", title: "みかん", resCount: 50 }),
    createThread({ url: "https://example.com/c", title: "いちじく", resCount: 20 }),
  ];
  const base = {
    threads,
    now: 1_000_000,
    searchQuery: "",
    searchOptions: DEFAULT_SEARCH_OPTIONS,
    sort: { column: null, direction: "asc" } as const,
    isBookmarked: (url: string) => url.endsWith("/b"),
  };

  it("未ソートの間は取得順を保ち、元の番号とブックマーク状態を付ける", () => {
    const rows = buildDisplayThreads(base);
    expect(rows.map((row) => [row.originalIndex, row.isBookmarked])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
  });

  it("検索語でタイトルを絞り込む", () => {
    const rows = buildDisplayThreads({ ...base, searchQuery: "いち" });
    expect(rows.map((row) => row.thread.title)).toEqual(["いちご", "いちじく"]);
  });

  it("降順ではレス数の多い順に並べる", () => {
    const rows = buildDisplayThreads({ ...base, sort: { column: "resCount", direction: "desc" } });
    expect(rows.map((row) => row.thread.resCount)).toEqual([50, 20, 5]);
  });
});

describe("filterVisibleThreads", () => {
  const rows = buildDisplayThreads({
    threads: [
      createThread({ url: "https://example.com/a" }),
      createThread({ url: "https://example.com/b", ng: { type: "ng", name: "ng" } }),
    ],
    now: 10_000,
    searchQuery: "",
    searchOptions: DEFAULT_SEARCH_OPTIONS,
    sort: { column: null, direction: "asc" },
    isBookmarked: () => false,
  });

  it("NGのスレは通常は除き、一時的に無効化している間は残す", () => {
    expect(filterVisibleThreads(rows, false)).toHaveLength(1);
    expect(filterVisibleThreads(rows, true)).toHaveLength(2);
  });
});

describe("buildThreadSections", () => {
  const highlight = (ruleIndex: number, label: string) =>
    ({
      type: "highlight",
      ruleIndex,
      name: label,
      params: { label },
    }) satisfies IThread["highlight"];
  const rows = buildDisplayThreads({
    threads: [
      createThread({ url: "https://example.com/a" }),
      createThread({ url: "https://example.com/b", highlight: highlight(2, "後") }),
      createThread({ url: "https://example.com/c", highlight: highlight(1, "先") }),
    ],
    now: 10_000,
    searchQuery: "",
    searchOptions: DEFAULT_SEARCH_OPTIONS,
    sort: { column: null, direction: "asc" },
    isBookmarked: () => false,
  });

  it("注目スレはルール順のセクションにし、その後ろに通常のスレを置く", () => {
    const sections = buildThreadSections(rows, false);
    expect(sections.map((section) => section.label)).toEqual([
      "先（1）",
      "後（1）",
      "スレ一覧（1）",
    ]);
  });
});

describe("countThreadListFlags", () => {
  it("NG・降格と注目のスレ数を数える", () => {
    const counts = countThreadListFlags([
      createThread({ url: "https://example.com/a", ng: { type: "ng", name: "ng" } }),
      createThread({ url: "https://example.com/b", demoted: { type: "ng", name: "d" } }),
      createThread({ url: "https://example.com/c", highlight: { type: "highlight", name: "h" } }),
      createThread({ url: "https://example.com/d" }),
    ]);
    expect(counts).toEqual({ ngCount: 2, highlightCount: 1 });
  });
});

describe("getThreadRowClassName", () => {
  it("該当する状態が無ければ undefined を返す", () => {
    expect(getThreadRowClassName(createThread({ url: "https://example.com/a" }), false)).toBe(
      undefined,
    );
  });

  it("降格したスレはNGを一時無効化している間はNG用のクラスを付けない", () => {
    const thread = createThread({
      url: "https://example.com/a",
      demoted: { type: "ng", name: "d" },
    });
    expect(getThreadRowClassName(thread, false)).toBe("thread-list__row--ng");
    expect(getThreadRowClassName(thread, true)).toBeUndefined();
  });
});

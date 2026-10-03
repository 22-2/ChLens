import type { IThread } from "src/service-container/interfaces";
import {
  type AutoNextThreadMode,
  findMainstreamThreadMatch,
  findNextThreadCandidates,
  findNextThreadMatch,
} from "src/view/browser/utils/next-thread-search";
import { describe, expect, it } from "vite-plus/test";

const MODES: AutoNextThreadMode[] = ["balanced", "aggressive"];
const BASE_TIMESTAMP = 1_700_100_000;

function thread(title: string, offset: number, overrides: Partial<IThread> = {}): IThread {
  return {
    title,
    url: `https://example.com/test/read.cgi/live/${BASE_TIMESTAMP + offset}/`,
    resCount: 20,
    createdAt: (BASE_TIMESTAMP + offset) * 1000,
    ng: undefined,
    highlight: undefined,
    isNet: null,
    readState: undefined,
    ...overrides,
  };
}

interface ContinuationCase {
  name: string;
  current: string;
  next: string;
  modes: readonly AutoNextThreadMode[];
}

// 実在する番組・スレを残さず、表記揺れとモードごとの許容範囲を独立した事例で検証する。
const CONTINUATIONS: ContinuationCase[] = [
  { name: "星番号", current: "架空の月面探検隊 ★1", next: "架空の月面探検隊 ★2", modes: MODES },
  {
    name: "Part番号",
    current: "架空の月面探検隊 Part1",
    next: "架空の月面探検隊 Part2",
    modes: MODES,
  },
  {
    name: "Partのドット",
    current: "架空の月面探検隊 Part.9",
    next: "架空の月面探検隊 Part.10",
    modes: MODES,
  },
  {
    name: "番号形式の切替",
    current: "架空の月面探検隊 ★1",
    next: "架空の月面探検隊 Part.2",
    modes: MODES,
  },
  {
    name: "全角の星番号",
    current: "架空の月面探検隊 ★１",
    next: "架空の月面探検隊 ★２",
    modes: MODES,
  },
  {
    name: "全角のPart表記",
    current: "架空の月面探検隊 Ｐａｒｔ．１",
    next: "架空の月面探検隊 Ｐａｒｔ．２",
    modes: MODES,
  },
  {
    name: "星と数字の空白",
    current: "架空の月面探検隊 ★ 1",
    next: "架空の月面探検隊 ★ 2",
    modes: MODES,
  },
  {
    name: "Partと数字の空白",
    current: "架空の月面探検隊 Part 1",
    next: "架空の月面探検隊 Part 2",
    modes: MODES,
  },
  {
    name: "Partのドット後の空白",
    current: "架空の月面探検隊 Part. 1",
    next: "架空の月面探検隊 Part. 2",
    modes: MODES,
  },
  {
    name: "初回番号の省略",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊 ★2",
    modes: MODES,
  },
  {
    name: "かなの表記揺れ",
    current: "架空のツキノ探検隊 ★1",
    next: "架空のつきの探検隊 ★2",
    modes: MODES,
  },
  {
    name: "括弧と空白の表記揺れ",
    current: "架空の月面探検隊（新） ★1",
    next: "架空の月面探検隊 (新) ★2",
    modes: MODES,
  },
  {
    name: "同じタイトルの後継",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊",
    modes: MODES,
  },
  {
    name: "反復する笑いの長さ",
    current: "架空の月面探検隊ｗｗｗ ★1",
    next: "架空の月面探検隊ww ★2",
    modes: MODES,
  },
  {
    name: "絵文字を含むタイトル",
    current: "架空の月面探検隊🌙 ★1",
    next: "架空の月面探検隊🌙 ★2",
    modes: MODES,
  },
  {
    name: "番組一覧の短縮",
    current: "【架空局】朝の冒険団→森の仲間たち→月の探検隊(新)",
    next: "【架空局】月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "二重矢印とPartへの切替",
    current: "【架空局】朝の冒険団⇒森の仲間たち⇒月の探検隊(新)",
    next: "【架空局】月の探検隊(新) Part.2",
    modes: ["aggressive"],
  },
  {
    name: "局名のない番組一覧",
    current: "朝の冒険団→森の仲間たち→月の探検隊(新)",
    next: "月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "長い番組一覧の短縮",
    current:
      "【架空局】朝の冒険団→森の仲間たち→銀河の守り隊→雲の配達人→海底の楽団→砂漠の旅行記→月の探検隊(新)",
    next: "【架空局】月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "番号なしの反省会",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊 反省会",
    modes: ["aggressive"],
  },
  {
    name: "番号付きから反省会",
    current: "架空の月面探検隊 ★12",
    next: "架空の月面探検隊 ★反省会",
    modes: ["aggressive"],
  },
  {
    name: "二つ先の番号",
    current: "架空の月面探検隊 ★1",
    next: "架空の月面探検隊 ★3",
    modes: ["aggressive"],
  },
];

describe.each(MODES)("自動次スレ判定の広範なケース（%s）", (mode) => {
  it.each(CONTINUATIONS)("$nameの継続をモードの許容範囲で評価する", ({ current, next, modes }) => {
    const source = thread(current, 0);
    const candidate = thread(next, 1);
    const expectedUrl = modes.includes(mode) ? candidate.url : undefined;
    expect(findNextThreadMatch([candidate], source, { mode })?.thread.url).toBe(expectedUrl);
    expect(
      findNextThreadCandidates([candidate], source, { mode }).map(({ thread }) => thread.url),
    ).toEqual(expectedUrl ? [expectedUrl] : []);
  });

  it.each([
    { name: "同じスレ", offset: 0, overrides: {} },
    { name: "元スレより古い", offset: -1, overrides: {} },
    {
      name: "別板",
      offset: 1,
      overrides: { url: `https://example.com/test/read.cgi/other/${BASE_TIMESTAMP + 1}/` },
    },
    {
      name: "別ホスト",
      offset: 1,
      overrides: { url: `https://example.org/test/read.cgi/live/${BASE_TIMESTAMP + 1}/` },
    },
    { name: "1000到達", offset: 1, overrides: { resCount: 1000 } },
    { name: "1000超過", offset: 1, overrides: { resCount: 1001 } },
  ])("本文で案内されても$nameの候補へ移動しない", ({ offset, overrides }) => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("架空の月面探検隊 ★2", offset, overrides);
    const options = { mode, responseMessages: [`次スレはこちら ${candidate.url}`] };
    expect(findNextThreadMatch([candidate], source, options)).toBeNull();
    expect(findNextThreadCandidates([candidate], source, options)).toEqual([]);
  });

  it.each([
    "★4",
    "★5",
    "★9",
    "Part.4",
    "★４",
    "★５",
    "★９",
    "★ 4",
    "★ 9",
    "Ｐａｒｔ．４",
    "Part 4",
    "Part. 4",
  ])("明示案内なしでは同じ番号や逆行する%sへ戻らない", (number) => {
    const source = thread("架空の月面探検隊 ★5", 0);
    const candidate = thread(`架空の月面探検隊 ${number}`, 1);
    // ★9は積極モードでも許容する番号飛びの範囲を超える。
    expect(findNextThreadMatch([candidate], source, { mode })).toBeNull();
  });

  it("999レスの候補は満了扱いせず評価する", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("架空の月面探検隊 ★2", 1, { resCount: 999 });
    expect(findNextThreadMatch([candidate], source, { mode })?.thread.url).toBe(candidate.url);
  });

  it("完全に題名が変わっても同じ板の本文案内を根拠に移動する", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("雲の配達人の臨時集会", 1);
    expect(
      findNextThreadMatch([candidate], source, {
        mode,
        responseMessages: [`次スレ ${candidate.url}`],
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it("一覧の並び順や別話題のレス数に関係なく同じ系列の次番号を選ぶ", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const expected = thread("架空の月面探検隊 ★2", 1, { resCount: 1 });
    const unrelated = thread("別世界の架空雑談広場", 2, { resCount: 900 });
    for (const candidates of [
      [expected, unrelated],
      [unrelated, expected],
    ]) {
      expect(findNextThreadMatch(candidates, source, { mode })?.thread.url).toBe(expected.url);
    }
  });
});

describe("移動後の本流監視の移動先制約", () => {
  const now = (BASE_TIMESTAMP + 100) * 1000;
  const original = thread("架空の月面探検隊 ★1", 0, { resCount: 1000 });
  const current = thread("架空の月面探検隊 ★2", 1, { resCount: 20 });

  it.each(MODES)("%sでは勢いのある同じ板の候補へ移動する", (mode) => {
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 100 });
    expect(
      findMainstreamThreadMatch([current, candidate], {
        originalThreadUrl: original.url,
        originalThreadTitle: original.title,
        currentThreadUrl: current.url,
        mode,
        now,
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it("元スレより後なら現在の移動先より先に立った本流候補も評価する", () => {
    const laterCurrent = thread("架空の月面探検隊 ★2", 3, { resCount: 20 });
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 100 });
    expect(
      findMainstreamThreadMatch([laterCurrent, candidate], {
        originalThreadUrl: original.url,
        originalThreadTitle: original.title,
        currentThreadUrl: laterCurrent.url,
        mode: "balanced",
        now,
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it.each([
    {
      name: "別板",
      overrides: { url: `https://example.com/test/read.cgi/other/${BASE_TIMESTAMP + 2}/` },
    },
    {
      name: "別ホスト",
      overrides: { url: `https://example.org/test/read.cgi/live/${BASE_TIMESTAMP + 2}/` },
    },
    {
      name: "元スレより古い",
      overrides: { url: `https://example.com/test/read.cgi/live/${BASE_TIMESTAMP - 1}/` },
    },
    { name: "満了", overrides: { resCount: 1000 } },
  ])("勢いが高くても$nameの候補へ移動しない", ({ overrides }) => {
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 900, ...overrides });
    for (const mode of MODES) {
      expect(
        findMainstreamThreadMatch([current, candidate], {
          originalThreadUrl: original.url,
          originalThreadTitle: original.title,
          currentThreadUrl: current.url,
          mode,
          now,
        }),
      ).toBeNull();
    }
  });
});

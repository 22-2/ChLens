import {
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";
import {
  applyLegacySearchTarget,
  compileThreadQuery,
  parseThreadQuery,
  type ThreadQueryTarget,
} from "src/view/browser/utils/thread-query";
import { describe, expect, it } from "vite-plus/test";

const NOW = new Date(2026, 9, 15, 10, 0, 0).valueOf();

const responses: ThreadQueryTarget[] = [
  { name: "名無し", id: "AbC123", message: "猫の画像です", date: "2026/10/02(金) 12:00:00" },
  { name: "ﾃｽﾄ住民", id: "xyz789", message: "犬の動画<br>です", date: "2026/10/03(土) 09:30:00" },
  { name: "名無し", id: "AbC123", message: "猫と犬", date: "2026/10/15(木) 08:00:00" },
];

function hits(query: string, options: Partial<SearchOptions> = {}): number[] {
  const compiled = compileThreadQuery(query, { ...DEFAULT_SEARCH_OPTIONS, ...options }, NOW);
  return responses.flatMap((res, index) => (compiled.matches(res) ? [index] : []));
}

describe("スレフィルタの検索構文の解析", () => {
  it("空白は AND、| は OR で、OR のほうが強く結びつく", () => {
    expect(parseThreadQuery("a b|c")).toEqual({
      kind: "and",
      operands: [
        { kind: "term", field: "body", text: "a" },
        {
          kind: "or",
          operands: [
            { kind: "term", field: "body", text: "b" },
            { kind: "term", field: "body", text: "c" },
          ],
        },
      ],
    });
  });

  it("| の前後の空白は OR の一部として読む", () => {
    expect(parseThreadQuery("a | b")).toEqual({
      kind: "or",
      operands: [
        { kind: "term", field: "body", text: "a" },
        { kind: "term", field: "body", text: "b" },
      ],
    });
  });

  it("! は語の先頭だけが NOT で、語の途中の ! は文字のまま", () => {
    expect(parseThreadQuery("!a")).toEqual({
      kind: "not",
      operand: { kind: "term", field: "body", text: "a" },
    });
    expect(parseThreadQuery("hello!")).toEqual({ kind: "term", field: "body", text: "hello!" });
  });

  it("全角の ！ と ｜ も同じ意味で読む", () => {
    expect(parseThreadQuery("！a｜b")).toEqual(parseThreadQuery("!a|b"));
  });

  it("接頭辞で欄を指定する（大文字小文字・全角コロンを問わない）", () => {
    expect(parseThreadQuery("ID:abc")).toEqual({ kind: "term", field: "id", text: "abc" });
    expect(parseThreadQuery("name：猫")).toEqual({ kind: "term", field: "name", text: "猫" });
    expect(parseThreadQuery("datetime:2026/10/02")).toEqual({
      kind: "term",
      field: "datetime",
      text: "2026/10/02",
    });
  });

  it("引用符で囲むと、空白・記号・接頭辞を含む語をそのまま読む", () => {
    expect(parseThreadQuery('"a b|c"')).toEqual({ kind: "term", field: "body", text: "a b|c" });
    expect(parseThreadQuery('"id:abc"')).toEqual({ kind: "term", field: "body", text: "id:abc" });
    expect(parseThreadQuery('datetime:"2026/10/02 12:00"')).toEqual({
      kind: "term",
      field: "datetime",
      text: "2026/10/02 12:00",
    });
  });

  it("入力の途中の語は、失敗させず条件に足さない", () => {
    expect(parseThreadQuery("")).toBeUndefined();
    expect(parseThreadQuery("!")).toBeUndefined();
    expect(parseThreadQuery("id:")).toBeUndefined();
    expect(parseThreadQuery("a |")).toEqual({ kind: "term", field: "body", text: "a" });
    expect(parseThreadQuery('"abc')).toEqual({ kind: "term", field: "body", text: "abc" });
  });
});

describe("スレフィルタの判定", () => {
  it("修飾の無い語は本文だけを探す", () => {
    expect(hits("猫")).toEqual([0, 2]);
    expect(hits("abc")).toEqual([]);
    expect(hits("名無し")).toEqual([]);
  });

  it("id: と name: は ID と名前を探し、大小・かな・半角を区別しない", () => {
    expect(hits("id:abc")).toEqual([0, 2]);
    expect(hits("name:てすと")).toEqual([1]);
    expect(hits("name:名無し")).toEqual([0, 2]);
  });

  it("AND・OR・NOT を組み合わせる", () => {
    expect(hits("猫 犬")).toEqual([2]);
    expect(hits("猫|犬")).toEqual([0, 1, 2]);
    expect(hits("!猫")).toEqual([1]);
    expect(hits("犬 !猫")).toEqual([1]);
    expect(hits("name:名無し !画像")).toEqual([2]);
  });

  it("date: は日付の範囲、datetime: は時刻まで絞る", () => {
    expect(hits("date:2026/10/02")).toEqual([0]);
    expect(hits("date:2026/10/02~2026/10/03")).toEqual([0, 1]);
    expect(hits("date:2026/10/03~")).toEqual([1, 2]);
    expect(hits("date:today")).toEqual([2]);
    expect(hits('datetime:"2026/10/02 11:00~2026/10/02 12:30"')).toEqual([0]);
    expect(hits("猫 date:2026/10")).toEqual([0, 2]);
  });

  it("日付が読めないレスは日付条件に一致しない", () => {
    const compiled = compileThreadQuery("date:2026/10", DEFAULT_SEARCH_OPTIONS, NOW);
    expect(compiled.matches({ name: "", message: "", date: "不明" })).toBe(false);
  });

  it("大文字小文字を区別する指定は、すべての語に効く", () => {
    expect(hits("id:abc", { caseSensitive: true })).toEqual([]);
    expect(hits("id:AbC", { caseSensitive: true })).toEqual([0, 2]);
  });

  it("かなを区別する指定は、すべての語に効く", () => {
    expect(hits("name:テスト", { kanaSensitive: true })).toEqual([1]);
    expect(hits("name:てすと", { kanaSensitive: true })).toEqual([]);
  });
});

describe("スレフィルタの読めない語", () => {
  it("読めない日付は理由を返し、条件から外して絞り込まない", () => {
    const compiled = compileThreadQuery("猫 date:abc", DEFAULT_SEARCH_OPTIONS, NOW);
    expect(compiled.error).toContain("abc");
    expect(responses.map((res) => compiled.matches(res))).toEqual([true, false, true]);
  });

  it("NOT の中の読めない日付で、全件が消えない", () => {
    const compiled = compileThreadQuery("!date:abc", DEFAULT_SEARCH_OPTIONS, NOW);
    expect(responses.every((res) => compiled.matches(res))).toBe(true);
    expect(compiled.error).not.toBeNull();
  });

  it("条件が空なら絞り込まず、理由も返さない", () => {
    const compiled = compileThreadQuery("", DEFAULT_SEARCH_OPTIONS, NOW);
    expect(compiled.error).toBeNull();
    expect(responses.every((res) => compiled.matches(res))).toBe(true);
  });
});

describe("正規表現のとき", () => {
  const regex = { regex: true };

  it("構文を解釈せず、入力全体を本文のパターンとして使う", () => {
    expect(hits("猫|犬", regex)).toEqual([0, 1, 2]);
    expect(hits("^猫の", regex)).toEqual([0]);
    expect(hits("id:abc", regex)).toEqual([]);
  });

  it("不正な式は絞り込まず理由を返す", () => {
    const compiled = compileThreadQuery("(", { ...DEFAULT_SEARCH_OPTIONS, ...regex }, NOW);
    expect(compiled.error).toEqual(expect.any(String));
    expect(responses.every((res) => compiled.matches(res))).toBe(true);
  });
});

describe("強調に使う判定器", () => {
  it("欄ごとに肯定の語だけを集め、否定の語は含めない", () => {
    const { highlight } = compileThreadQuery("猫 !犬 id:abc", DEFAULT_SEARCH_OPTIONS, NOW);
    const find = (matcher: typeof highlight.body, text: string) =>
      matcher?.find(matcher.normalize(text)) ?? [];
    expect(find(highlight.body, "猫と犬")).toEqual([{ start: 0, end: 1 }]);
    expect(find(highlight.id, "AbC123")).toEqual([{ start: 0, end: 3 }]);
    expect(highlight.name).toBeNull();
  });

  it("同じ欄の複数の語は、重ならない範囲に合わせる", () => {
    const { highlight } = compileThreadQuery("猫|猫と", DEFAULT_SEARCH_OPTIONS, NOW);
    expect(highlight.body?.find(highlight.body.normalize("猫と犬"))).toEqual([
      { start: 0, end: 2 },
    ]);
  });
});

describe("旧版の検索対象の引き継ぎ", () => {
  it("名前・IDを対象にしていた検索語は、欄を指定した構文へ直す", () => {
    expect(applyLegacySearchTarget("abc", "id")).toBe('id:"abc"');
    expect(applyLegacySearchTarget(" 名無し さん ", "name")).toBe('name:"名無し さん"');
    expect(applyLegacySearchTarget('a"b', "name")).toBe('name:"ab"');
  });

  it("本文・すべて・未設定、空の検索語は変えない", () => {
    expect(applyLegacySearchTarget("abc", "body")).toBe("abc");
    expect(applyLegacySearchTarget("abc", "all")).toBe("abc");
    expect(applyLegacySearchTarget("abc", undefined)).toBe("abc");
    expect(applyLegacySearchTarget("  ", "id")).toBe("  ");
  });

  it("直した構文は元の語をそのまま探す", () => {
    const compiled = compileThreadQuery(
      applyLegacySearchTarget("a b", "name"),
      DEFAULT_SEARCH_OPTIONS,
      NOW,
    );
    expect(compiled.matches({ name: "xa bx", message: "", date: "" })).toBe(true);
    expect(compiled.matches({ name: "a", message: "a b", date: "" })).toBe(false);
  });
});

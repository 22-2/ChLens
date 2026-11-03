import {
  compileSearch,
  DEFAULT_SEARCH_OPTIONS,
  matchesSearchQuery,
  normalizeSearchText,
  type SearchOptions,
  splitSearchUnits,
} from "src/view/browser/utils/search-normalize";
import { describe, expect, it } from "vite-plus/test";

describe("検索語の正規化", () => {
  it("カタカナをひらがなに、大文字を小文字にそろえる", () => {
    expect(normalizeSearchText("カタカナABC")).toBe("かたかなabc");
  });

  it("全角英数字と半角カナを、半角英数字と全角のひらがなにそろえる", () => {
    expect(normalizeSearchText("ＡＢＣ１２３")).toBe("abc123");
    expect(normalizeSearchText("ｶﾀｶﾅ")).toBe("かたかな");
  });

  it("半角カナの濁点・半濁点は前の文字と合わせて1文字にする", () => {
    expect(normalizeSearchText("ｶﾞｯﾂﾎﾟｰｽﾞ")).toBe(normalizeSearchText("ガッツポーズ"));
    expect(splitSearchUnits("ｶﾞｷ")).toEqual(["ｶﾞ", "ｷ"]);
  });

  it("互換文字は展開してそろえる", () => {
    expect(normalizeSearchText("㍻")).toBe("平成");
  });
});

describe("検索条件の切り替え", () => {
  const compile = (query: string, options: Partial<SearchOptions> = {}) =>
    compileSearch(query, { ...DEFAULT_SEARCH_OPTIONS, ...options });

  it("既定では大文字小文字もかなも区別せず、従来どおり一致する", () => {
    expect(matchesSearchQuery("ガッツ ABC", "がっつ abc")).toBe(true);
  });

  it("大文字小文字を区別すると、大小が違う語は一致しない", () => {
    expect(
      matchesSearchQuery("Hello", "hello", { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }),
    ).toBe(false);
    expect(
      matchesSearchQuery("Hello", "Hello", { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }),
    ).toBe(true);
  });

  it("かなを区別すると、ひらがなとカタカナは一致しないが、半角カナは全角カナと同じ", () => {
    const options = { ...DEFAULT_SEARCH_OPTIONS, kanaSensitive: true };
    expect(matchesSearchQuery("カタカナ", "かたかな", options)).toBe(false);
    expect(matchesSearchQuery("かたかな", "かたかな", options)).toBe(true);
    expect(matchesSearchQuery("ｶﾀｶﾅ", "カタカナ", options)).toBe(true);
  });

  it("正規表現として一致を探し、空文字への一致は数えない", () => {
    const { matcher } = compile("a+|x*", { regex: true });
    const text = "aa b a";
    expect(matcher?.find(matcher.normalize(text))).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 6 },
    ]);
  });

  it("正規表現でも既定では大文字小文字を区別せず、区別の指定で区別する", () => {
    expect(matchesSearchQuery("ABC", "^abc$", { ...DEFAULT_SEARCH_OPTIONS, regex: true })).toBe(
      true,
    );
    expect(
      matchesSearchQuery("ABC", "^abc$", {
        ...DEFAULT_SEARCH_OPTIONS,
        regex: true,
        caseSensitive: true,
      }),
    ).toBe(false);
  });

  it("正規表現のクラス指定を、大文字小文字の正規化で壊さない", () => {
    const options = { ...DEFAULT_SEARCH_OPTIONS, regex: true, caseSensitive: true };
    expect(matchesSearchQuery("a1", String.raw`^\D\d$`, options)).toBe(true);
    expect(matchesSearchQuery("11", String.raw`^\D\d$`, options)).toBe(false);
  });

  it("正規表現でもカタカナは、かな非区別のときひらがなとして探す", () => {
    expect(matchesSearchQuery("ガッツ", "が.つ", { ...DEFAULT_SEARCH_OPTIONS, regex: true })).toBe(
      true,
    );
    expect(
      matchesSearchQuery("ガッツ", "が.つ", {
        ...DEFAULT_SEARCH_OPTIONS,
        regex: true,
        kanaSensitive: true,
      }),
    ).toBe(false);
  });

  it("不正な正規表現は絞り込まず、理由を返す", () => {
    const result = compile("(", { regex: true });
    expect(result.matcher).toBeNull();
    expect(result.error).toEqual(expect.any(String));
    expect(matchesSearchQuery("何か", "(", { ...DEFAULT_SEARCH_OPTIONS, regex: true })).toBe(true);
  });

  it("検索語が空なら絞り込まない", () => {
    expect(compile("").matcher).toBeNull();
    expect(compile("", { regex: true }).error).toBeNull();
  });
});

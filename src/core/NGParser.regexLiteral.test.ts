import { parseNgString, setupNgRegex } from "src/core/NGParser";
import { TYPE } from "src/core/NGTypes";
import { describe, expect, it, vi } from "vite-plus/test";

// 実際の normalize はカタカナ→ひらがな・小文字化・空白除去を行う。
// ここでは「正規表現型の word は normalize されない / 非正規表現型はされる」ことを
// 観測するため、カタカナ→ひらがな変換と小文字化だけを行うモックにする。
vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) =>
    value
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .toLowerCase(),
  stringToDate: (value: string) => new Date(value.replace(/\//g, "-")),
}));

describe("NGParser 正規表現型は word を正規化しない(文字通り扱う)", () => {
  it("RegExpHighlightTitle の word はカタカナのまま保持され、生のカタカナタイトルにマッチする", () => {
    // 退行防止: 以前は word が normalize されて「ラノベ→らのべ」になり、
    // 生タイトル(カタカナ)に対する reg.test が一致しなかった。
    const rules = Array.from(
      parseNgString('RegExpHighlightTitle(word="ロシア|小説|ラノベ")'),
    );
    expect(rules).toHaveLength(1);

    const rule = rules[0];
    expect(rule.type).toBe(TYPE.REG_EXP_HIGHLIGHT_TITLE);
    // word は正規化されず原文のまま
    expect(rule.word).toBe("ロシア|小説|ラノベ");

    setupNgRegex(rules, () => {});
    expect(rule.reg).toBeInstanceOf(RegExp);
    // NGMatcher は REG_EXP_HIGHLIGHT_TITLE を生の title に対して test する
    expect(rule.reg!.test("【朗報】ワイの書いたラノベ、ついに発売する！")).toBe(
      true,
    );
  });

  it("非正規表現型(Title)の word は従来どおり normalize される", () => {
    const rules = Array.from(parseNgString('Title(word="ラノベ")'));
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe(TYPE.TITLE);
    // Title は .includes() 系なので word はひらがな化される
    expect(rules[0].word).toBe("らのべ");
  });

  it("RegExpBody の \\S などのメタ文字が小文字化で壊れない", () => {
    // normalize による小文字化は \S→\s 等の反転を招くため、正規表現型では禁止。
    const rules = Array.from(parseNgString('RegExpBody(word="\\S{10}")'));
    expect(rules).toHaveLength(1);
    expect(rules[0].word).toBe("\\S{10}");
  });
});

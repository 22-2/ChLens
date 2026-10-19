import { normalizeSearchText, splitSearchUnits } from "src/view/browser/utils/search-normalize";
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

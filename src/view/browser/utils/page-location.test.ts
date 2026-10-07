import { normalizePageLocation } from "src/view/browser/utils/page-location";
import { describe, expect, it } from "vite-plus/test";

describe("normalizePageLocation", () => {
  it("ハッシュを除去し末尾スラッシュを1つに揃える", () => {
    expect(normalizePageLocation("https://example.com/board//#top")).toBe(
      "https://example.com/board/",
    );
  });

  it("旧ホストの板URLもchlibの正規形に揃えて同一視する", () => {
    expect(normalizePageLocation("https://egg.5ch.net/software/")).toBe(
      normalizePageLocation("https://egg.5ch.io/software/"),
    );
  });

  it("別のURLコンストラクタを渡してもURLを正規化できる", () => {
    expect(normalizePageLocation("https://example.com/a#b", URL)).toBe("https://example.com/a/");
  });

  it("URLとして解釈できない入力は前後の空白と末尾スラッシュだけ除いて返す", () => {
    expect(normalizePageLocation("  not a url//  ")).toBe("not a url");
  });
});

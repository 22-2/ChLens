import { describe, expect, it } from "vite-plus/test";

import { detectAsciiArt } from "./detect-ascii-art";

describe("detectAsciiArt", () => {
  it("複数行にわたる全角空白の配置をAAとして検出する", () => {
    expect(detectAsciiArt("　／￣￣￣＼<br>　|　・　・　|<br>　＼＿＿＿／")).toBe(true);
  });

  it("罫線・図形記号で構成された複数行を検出する", () => {
    expect(detectAsciiArt("┌────┐<br>│　猫　│<br>└────┘")).toBe(true);
  });

  it("通常の文章、空白が多い一行、コードは誤検出しない", () => {
    expect(
      detectAsciiArt("今日は良い天気ですね。<br>散歩に行きました。<br>気持ちよかったです。"),
    ).toBe(false);
    expect(detectAsciiArt("　　これは一行の文章です")).toBe(false);
    expect(detectAsciiArt("```<br>function add(a, b) {<br>  return a + b;<br>}```")).toBe(false);
  });
});

import { buildKyodemoUrl } from "src/view/browser/utils/kyodemo-url";
import { describe, expect, it } from "vite-plus/test";

describe("実況共有URL", () => {
  it("掲示板ライブラリが解決した板名とスレIDからURLを組み立てる", () => {
    expect(
      buildKyodemoUrl("https://example.com/test/read.cgi/sample-board/1234567890/", "12"),
    ).toMatch(
      /^https:\/\/www\.kyodemo\.net\/sdemo\/b\/e_e_sample-board\/?\?hi=12&key=1234567890&date=\d{8}$/,
    );
  });

  it("スレッドURLとして解決できない入力は共有URLを作らない", () => {
    expect(buildKyodemoUrl("https://example.com/page", "12")).toBeNull();
  });
});

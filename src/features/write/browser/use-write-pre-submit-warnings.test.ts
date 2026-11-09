import { describe, expect, it } from "vite-plus/test";

import { collectPreSubmitWarnings } from "./use-write-pre-submit-warnings";

describe("collectPreSubmitWarnings", () => {
  it("警告に当たらない入力では空の配列を返す", () => {
    expect(collectPreSubmitWarnings("名無し", "sage", "こんにちは")).toEqual([]);
  });

  it("名前・メール欄も含めて個人情報らしき文字列を検出する", () => {
    const warnings = collectPreSubmitWarnings("名無し", "user@example.com", "こんにちは");
    expect(warnings.map((warning) => warning.category)).toEqual(["メールアドレス"]);
  });

  it("本文のURLに追跡パラメータがあれば、最後に追跡パラメータの警告を足す", () => {
    const warnings = collectPreSubmitWarnings(
      "名無し",
      "",
      "見て https://example.com/page?utm_source=share 192.168.0.1",
    );
    expect(warnings.map((warning) => warning.category)).toEqual([
      "IPアドレス",
      "URLの追跡パラメータ",
    ]);
  });
});

import { getNgBadgeLabel } from "src/view/browser/utils/ng-badge";
import { describe, expect, it } from "vite-plus/test";

describe("getNgBadgeLabel", () => {
  it("実際に一致したDSL条件を判定種別より優先して表示する", () => {
    expect(
      getNgBadgeLabel({
        type: "Body",
        ruleDescription: "hide body contains:\n  対象ワード",
      }),
    ).toBe("NGルール\nhide body contains:\n  対象ワード");
  });
});

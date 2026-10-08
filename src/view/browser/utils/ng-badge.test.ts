// @vitest-environment node
import { getNgBadgeLabel } from "src/view/browser/utils/ng-badge";
import { describe, expect, it } from "vite-plus/test";

describe("getNgBadgeLabel", () => {
  it("実際に一致したDSL条件を判定種別より優先して表示する", () => {
    expect(
      getNgBadgeLabel({
        type: "Body",
        ruleDescription: 'hide:\n  when body contains "対象ワード"',
      }),
    ).toBe('NGルール\nhide:\n  when body contains "対象ワード"');
  });
});

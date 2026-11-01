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

  it("ルールに名前（label）があれば、理由として先頭に出し、DSL条件は次の行に続ける", () => {
    expect(
      getNgBadgeLabel({
        type: "Body",
        ruleDescription: 'collapse:\n  when body contains "対象ワード"',
        params: { label: "宣伝" },
      }),
    ).toBe('NGルール: 宣伝\ncollapse:\n  when body contains "対象ワード"');
  });

  it("名前だけがあるとき（DSL条件がないとき）は、名前だけを理由として出す", () => {
    expect(getNgBadgeLabel({ type: "Body", params: { label: "宣伝" } })).toBe("NGルール: 宣伝");
  });

  it("名前の前後の空白は無視する", () => {
    expect(getNgBadgeLabel({ type: "Body", params: { label: "  宣伝  " } })).toBe("NGルール: 宣伝");
  });

  it("結果がなければ、ルール情報がないことを出す", () => {
    expect(getNgBadgeLabel(undefined)).toBe("NG（ルール情報なし）");
  });
});

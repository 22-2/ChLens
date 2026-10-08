// @vitest-environment node
import {
  NG_DSL_LANGUAGE_ID,
  NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
  stringifyNgDslValue,
} from "src/core/ng/ngDsl";
import { describe, expect, it } from "vite-plus/test";

describe("NG DSL editor helpers", () => {
  it("exposes the language id and centralized highlight colors", () => {
    expect(NG_DSL_LANGUAGE_ID).toBe("chlens-ngdsl");
    expect(NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map(({ name }) => name)).toContain("blue");
  });

  it("keeps simple values readable and quotes DSL-significant values", () => {
    expect(stringifyNgDslValue("abc123")).toBe('"abc123"');
    expect(stringifyNgDslValue("two words")).toBe('"two words"');
    expect(stringifyNgDslValue("a:b")).toBe('"a:b"');
    expect(stringifyNgDslValue("#tag")).toBe('"#tag"');
    expect(stringifyNgDslValue("abc123")).toBe('"abc123"');
  });
});

describe("引用文字列の往復", () => {
  it("引用符・バックスラッシュ・改行を含む選択範囲を安全に保存する", async () => {
    const { parseRuleDsl } = await import("@chlen/chlib");
    const value = 'a"b\\c\n次の行';
    const result = parseRuleDsl(`hide:\n  when body contains ${stringifyNgDslValue(value)}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0].matchers).toEqual([{ kind: "contains", value }]);
  });
});

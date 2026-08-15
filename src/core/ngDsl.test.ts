import {
  NG_DSL_LANGUAGE_ID,
  NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
  stringifyNgDslValue,
} from "src/core/ngDsl";
import { describe, expect, it } from "vite-plus/test";

describe("NG DSL editor helpers", () => {
  it("exposes the language id and centralized highlight colors", () => {
    expect(NG_DSL_LANGUAGE_ID).toBe("chlens-ngdsl");
    expect(NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map(({ name }) => name)).toContain("blue");
  });

  it("keeps simple values readable and quotes DSL-significant values", () => {
    expect(stringifyNgDslValue("abc123")).toBe("abc123");
    expect(stringifyNgDslValue("two words")).toBe('"two words"');
    expect(stringifyNgDslValue("a:b")).toBe('"a:b"');
    expect(stringifyNgDslValue("#tag")).toBe('"#tag"');
    expect(stringifyNgDslValue("abc123", { alwaysQuote: true })).toBe('"abc123"');
  });
});

// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { formatRuleDsl, parseRuleDsl } from "./dsl";

describe("アプリから共有NG DSLを利用する", () => {
  it("whenとunlessを解析し、同じ構文で保存する", () => {
    const source = 'hide:\n  when body contains "spam"\n  unless id contains "許可ID"';
    const result = parseRuleDsl(source);
    expect(result.diagnostics).toEqual([]);
    expect(formatRuleDsl(result.rules)).toBe(source);
  });
  it("旧見出し形式を受け付けない", () => {
    expect(parseRuleDsl("hide body contains:\n  spam").diagnostics.length).toBeGreaterThan(0);
  });
});

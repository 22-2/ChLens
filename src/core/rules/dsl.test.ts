import { formatRuleDsl, parseRuleDsl } from "src/core/rules/dsl";
import { describe, expect, it } from "vite-plus/test";

describe("rule block DSL", () => {
  it("parses action, target, options and OR matchers", () => {
    const result = parseRuleDsl(`highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  google
  ぐーぐる`);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toEqual([
      {
        action: "highlight",
        target: "title",
        enabled: true,
        scope: { sites: ["bbs.eddibb.cc"] },
        presentation: { color: "blue", label: "注目" },
        matchers: [
          { kind: "contains", value: "google" },
          { kind: "contains", value: "ぐーぐる" },
        ],
      },
    ]);
  });

  it("normalizes ng to hide and preserves regex source", () => {
    const result = parseRuleDsl(`ng body:
  regex '(imgur\\.com\\/.+?){15}'`);
    expect(result.rules[0]).toMatchObject({
      action: "hide",
      target: "body",
      matchers: [{ kind: "regex", source: "(imgur\\.com\\/.+?){15}" }],
    });
  });

  it("formats canonical DSL that can be parsed again", () => {
    const source = `highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  google
  ぐーぐる`;
    const first = parseRuleDsl(source);
    const formatted = formatRuleDsl(first.rules);
    expect(formatted).toBe(source);
    expect(parseRuleDsl(formatted).rules).toEqual(first.rules);
  });

  it("reports unsupported actions instead of treating them as body text", () => {
    const result = parseRuleDsl(`remove body:\n  spam`);
    expect(result.recognized).toBe(true);
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ line: 1, message: "未対応の動作です: remove" });
  });

  it("allows comments between multiple block rules", () => {
    const result = parseRuleDsl(`highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  google

// 既存の強いNG条件も残しつつ、現在のDSLを整理した版
highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  microsoft`);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toHaveLength(2);
  });

  it("accepts the settings-editor example with a comment at line 12", () => {
    const source = `highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  google
  ぐーぐる

hide body:
  regex "(imgur\\\\.com\\\\/.+?){15}"

hide id:
  abc123

// 既存の強いNG条件も残しつつ、現在のDSLを整理した版
highlight title color=blue label=注目 sites=[bbs.eddibb.cc]:
  microsoft`;
    expect(parseRuleDsl(source).diagnostics).toEqual([]);
  });
});

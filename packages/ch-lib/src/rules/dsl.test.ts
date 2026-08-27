import { formatRuleDsl, parseRuleDsl } from "./dsl";
import { describe, expect, it } from "vite-plus/test";

describe("rule block DSL", () => {
  it("parses an explicit matcher, target and options", () => {
    const result =
      parseRuleDsl(`highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
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

  it("parses a quoted regex without doubling backslashes", () => {
    const result = parseRuleDsl(String.raw`hide body regex:
  "(imgur\.com/.+?){15}"`);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toMatchObject({
      action: "hide",
      target: "body",
      matchers: [{ kind: "regex", source: String.raw`(imgur\.com/.+?){15}` }],
    });
  });

  it("parses numeric comparisons on the same line", () => {
    const result = parseRuleDsl("hide anchor-count >= 10:");
    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toEqual([
      {
        action: "hide",
        target: "anchor-count",
        enabled: true,
        matchers: [{ kind: "contains", value: "10" }],
      },
    ]);
  });

  it("formats canonical DSL that can be parsed again", () => {
    const source = String.raw`highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  google
  ぐーぐる

hide body regex:
  "(imgur\.com/.+?){15}"

hide anchor-count >= 10:`;
    const first = parseRuleDsl(source);
    const formatted = formatRuleDsl(first.rules);
    expect(formatted).toBe(source);
    expect(parseRuleDsl(formatted).rules).toEqual(first.rules);
  });

  it("requires a quoted value for regex conditions", () => {
    const result = parseRuleDsl(String.raw`hide body regex:
  imgur\.com`);
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      line: 2,
      message: "regex の値は引用符で囲んでください。",
    });
  });

  it("rejects the former implicit matcher syntax", () => {
    const result = parseRuleDsl(`hide body:
  spam`);
    expect(result.rules).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      line: 1,
      column: 1,
      message: "条件種別または比較演算子が必要です。",
    });
  });

  it("reports unsupported actions instead of treating them as body text", () => {
    const result = parseRuleDsl(`remove body contains:
  spam`);
    expect(result.recognized).toBe(true);
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ line: 1, message: "未対応の動作です: remove" });
  });

  it("uses demote as the only action for moving board threads to the lower section", () => {
    expect(parseRuleDsl("demote title contains:\n  quiet").rules[0]).toMatchObject({
      action: "demote",
    });
    expect(parseRuleDsl("mute title contains:\n  quiet").diagnostics[0]).toMatchObject({
      message: "未対応の動作です: mute",
    });
  });

  it("rejects removed function-style option names", () => {
    const result = parseRuleDsl(`highlight title contains bgColor=red:
  注目`);
    expect(result.rules).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      line: 1,
      message: "未対応のオプションです: bgColor",
    });
  });

  it("allows comments between multiple block rules", () => {
    const result =
      parseRuleDsl(`highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  google

// コメント
highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  microsoft`);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toHaveLength(2);
  });

  it("accepts the settings-editor example with a comment at line 12", () => {
    const source = String.raw`highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  google
  ぐーぐる

hide body regex:
  "(imgur\.com/.+?){15}"

hide id contains:
  abc123

// 既存の強いNG条件も残しつつ、現在のDSLを整理した版
highlight title contains color=blue label=注目 sites=[bbs.eddibb.cc]:
  microsoft`;
    expect(parseRuleDsl(source).diagnostics).toEqual([]);
  });
});

import { evaluateImageRules, evaluateResponseRules, validateRuleDsl } from "@chlen/chlib";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/ui/DslEditor", () => ({
  DslEditor: () => null,
  DslHelpSnippet: () => null,
}));

import { NG_DSL_EXAMPLES, tokenizeNgDslLine } from "./NGEditor";

describe("初心者向けNG記法例", () => {
  const context = {
    title: "通常スレ",
    all: "本文",
    body: "本文",
    name: "名無し",
    mail: "",
    url: "https://example.com/board/",
    id: "sample001",
  };
  it.each(NG_DSL_EXAMPLES)("「$title」はそのまま保存できる", ({ code }) => {
    expect(validateRuleDsl(code).valid).toBe(true);
  });
  it("複数IDの例は列挙したどのIDにも一致し、それ以外を残す", () => {
    const rules = validateRuleDsl(NG_DSL_EXAMPLES[1].code).rules;
    for (const id of ["sample001", "sample002", "sample003"]) {
      expect(evaluateResponseRules(rules, { ...context, id })?.rule.action).toBe("hide");
    }
    expect(evaluateResponseRules(rules, { ...context, id: "other" })).toBeNull();
  });
  it("unlessだけの例は指定した言葉を含むレスを残し、それ以外を非表示にする", () => {
    const rules = validateRuleDsl(NG_DSL_EXAMPLES[3].code).rules;
    expect(evaluateResponseRules(rules, { ...context, body: "保存用の本文" })).toBeNull();
    expect(evaluateResponseRules(rules, context)?.rule.action).toBe("hide");
  });
  it("似た画像の例は、例の値に似た画像だけをぼかす", () => {
    const example = NG_DSL_EXAMPLES.find(({ title }) => title === "似た画像をぼかす");
    const rules = validateRuleDsl(example!.code).rules;
    expect(evaluateImageRules(rules, context, ["0123456789abcdef"])?.rule.action).toBe("blur");
    expect(evaluateImageRules(rules, context, ["fedcba9876543210"])).toBeNull();
  });
});

describe("記述例の色付け", () => {
  it("similarは比較の種類、similarityは設定として色を付ける", () => {
    expect(tokenizeNgDslLine('  when image similar "0123456789abcdef"')).toEqual([
      { type: "plain", text: "  " },
      { type: "rule", text: "when" },
      { type: "plain", text: " " },
      { type: "rule", text: "image" },
      { type: "plain", text: " " },
      { type: "rule", text: "similar" },
      { type: "plain", text: " " },
      { type: "string", text: '"0123456789abcdef"' },
    ]);
    expect(tokenizeNgDslLine("  similarity 85%")).toEqual([
      { type: "param", text: "  similarity" },
      { type: "plain", text: " 85%" },
    ]);
  });
});

import { evaluateResponseRules, validateRuleDsl } from "@chlen/chlib";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/ui/DslEditor", () => ({
  DslEditor: () => null,
  DslHelpSnippet: () => null,
}));

import { NG_DSL_EXAMPLES } from "./NGEditor";

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
});

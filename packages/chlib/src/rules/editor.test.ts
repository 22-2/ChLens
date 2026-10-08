// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import {
  NG_DSL_LANGUAGE_ID,
  RULE_DSL_COMPLETION_CANDIDATES,
  RULE_DSL_LANGUAGE_DEFINITION,
} from "./editor";

describe("shared rule editor definition", () => {
  it("exposes catalog-backed language tokens and completions", () => {
    expect(NG_DSL_LANGUAGE_ID).toBe("chlens-ngdsl");
    expect(RULE_DSL_LANGUAGE_DEFINITION.targets.map(({ name }) => name)).toContain("body");
    expect(RULE_DSL_LANGUAGE_DEFINITION.operators).toContain("when");
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.some(
        ({ category, label }) => category === "header" && label === "hide (body)",
      ),
    ).toBe(true);
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.some(
        ({ category, label }) => category === "condition" && label === "when res-count >=",
      ),
    ).toBe(true);
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.some(
        ({ category, label }) => category === "color" && label === "blue",
      ),
    ).toBe(true);
  });
});

describe("補完の構文検証", () => {
  it("動作スニペットはすべて新文法で解析できる", async () => {
    const { validateRuleDsl } = await import("./validator");
    for (const candidate of RULE_DSL_COMPLETION_CANDIDATES.filter(
      ({ category }) => category === "header",
    )) {
      const source = candidate.insertText.replace(/\$\{\d+:([^}]+)\}/gu, "$1");
      expect(validateRuleDsl(source).diagnostics, candidate.label).toEqual([]);
    }
  });
});

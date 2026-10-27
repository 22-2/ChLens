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

  it("類似画像NGの見出しと設定のスニペットを出す", () => {
    const blur = RULE_DSL_COMPLETION_CANDIDATES.find(
      ({ category, label }) => category === "header" && label === "blur (image)",
    );
    expect(blur?.insertText).toBe(
      'blur:\n  similarity ${1:85}%\n  when image similar "${2:0123456789abcdef}"',
    );
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.find(
        ({ category, label }) => category === "option" && label === "similarity",
      )?.insertText,
    ).toBe("similarity ${1:85}%");
    // blurは画像以外の対象と、imageはblur以外の動作と組み合わせない。
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.filter(
        ({ category, label }) =>
          category === "header" && (label.startsWith("blur ") || label.endsWith("(image)")),
      ).map(({ label }) => label),
    ).toEqual(["blur (image)"]);
  });
});

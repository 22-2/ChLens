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
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.some(
        ({ category, label }) => category === "header" && label === "hide body contains",
      ),
    ).toBe(true);
    expect(
      RULE_DSL_COMPLETION_CANDIDATES.some(
        ({ category, label }) => category === "color" && label === "blue",
      ),
    ).toBe(true);
  });
});

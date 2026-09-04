import {
  getRuleTargetDefinition,
  normalizeRuleTarget,
  RULE_TARGET_CATALOG,
} from "src/core/rules/catalog";
import { describe, expect, it } from "vite-plus/test";

describe("rule target catalog", () => {
  it("keeps the DSL spelling, field and comparison together", () => {
    const definition = getRuleTargetDefinition("res-count");
    expect(definition).toMatchObject({
      name: "res-count",
      field: "resCount",
      comparison: "greater-than-or-equal",
      resultTypes: ["ResCount", "ResCount"],
      allowedOnBoard: true,
      allowedOnThread: false,
    });
    expect(normalizeRuleTarget("res-count")).toBe("res-count");
    expect(getRuleTargetDefinition("anchor-count")).toMatchObject({
      name: "anchor-count",
      field: "anchorCount",
      comparison: "greater-than-or-equal",
      resultTypes: ["AnchorCount", "AnchorCount"],
      allowedOnBoard: false,
      allowedOnThread: true,
    });
    expect(getRuleTargetDefinition("similar-image")).toMatchObject({
      name: "similar-image",
      aliases: ["SimilarImage"],
      field: "similarImage",
      comparison: "contains",
      resultTypes: ["SimilarImage", "SimilarImage"],
      allowedOnBoard: false,
      allowedOnThread: true,
    });
    expect(normalizeRuleTarget("SimilarImage")).toBe("similar-image");
  });

  it("exposes every target through the completion catalog", () => {
    expect(RULE_TARGET_CATALOG.map(({ name }) => name)).toEqual([
      "all",
      "title",
      "body",
      "name",
      "mail",
      "id",
      "slip",
      "url",
      "res-count",
      "reply-count",
      "anchor-count",
      "similar-image",
    ]);
  });
});

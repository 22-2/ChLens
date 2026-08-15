import {
  getRuleTargetDefinition,
  normalizeRuleTarget,
  RULE_TARGET_CATALOG,
} from "src/core/rules/catalog";
import { describe, expect, it } from "vite-plus/test";

describe("rule target catalog", () => {
  it("keeps the DSL spelling, legacy alias, field and comparison together", () => {
    const definition = getRuleTargetDefinition("res-count");
    expect(definition).toMatchObject({
      name: "res-count",
      aliases: ["res_count"],
      field: "resCount",
      comparison: "greater-than",
      legacyTypes: ["ResCount", "ResCount"],
      allowedOnBoard: true,
      allowedOnThread: false,
    });
    expect(normalizeRuleTarget("res_count")).toBe("res-count");
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
    ]);
  });
});

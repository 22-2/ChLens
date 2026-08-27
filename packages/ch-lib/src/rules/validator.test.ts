import { describe, expect, it } from "vite-plus/test";
import { parseAndValidateRuleDsl, RuleDslValidationError, validateRuleDsl } from "./validator";

describe("rule DSL validator", () => {
  it("returns parsed rules and a valid flag without a storage dependency", () => {
    const result = validateRuleDsl("hide body contains:\n  spam");

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toMatchObject({ target: "body" });
  });

  it("raises a typed error only at the assertive boundary", () => {
    const source = "hide body regex:\n  not-quoted";

    expect(validateRuleDsl(source).valid).toBe(false);
    expect(() => parseAndValidateRuleDsl(source)).toThrow(RuleDslValidationError);
  });
});

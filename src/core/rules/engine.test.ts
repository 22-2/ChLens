import { matchRules } from "src/core/rules/engine";
import type { Rule } from "src/core/rules/model";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/jsutil", () => ({ normalize: (value: string) => value.toLowerCase() }));

const HIDE = new Set<Rule["action"]>(["hide"]);
const BODY = new Set<Rule["target"]>(["body"]);
const RES_COUNT = new Set<Rule["target"]>(["res-count"]);

describe("rule engine", () => {
  it("evaluates typed contains and regex matchers directly", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [
          { kind: "contains", value: "荒らし" },
          { kind: "regex", source: "imgur\\.com" },
        ],
      },
    ];
    expect(
      matchRules(rules, { body: "これは荒らし", url: "https://example.com" }, HIDE, BODY)?.type,
    ).toBe("Body");
    expect(
      matchRules(rules, { body: "https://imgur.com/a", url: "https://example.com" }, HIDE, BODY)
        ?.type,
    ).toBe("RegExpBody");
  });

  it("reports an invalid regex once and skips it", () => {
    const onError = vi.fn();
    const rules: Rule[] = [
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [{ kind: "regex", source: "[" }],
      },
    ];
    expect(
      matchRules(rules, { body: "x", url: "https://example.com" }, HIDE, BODY, onError),
    ).toBeNull();
    expect(
      matchRules(rules, { body: "x", url: "https://example.com" }, HIDE, BODY, onError),
    ).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("matches res-count at the configured threshold", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "res-count",
        enabled: true,
        matchers: [{ kind: "contains", value: "10" }],
      },
    ];

    expect(
      matchRules(rules, { resCount: 9, url: "https://example.com" }, HIDE, RES_COUNT),
    ).toBeNull();
    expect(
      matchRules(rules, { resCount: 10, url: "https://example.com" }, HIDE, RES_COUNT)?.type,
    ).toBe("ResCount");
  });
});

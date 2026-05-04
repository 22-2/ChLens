import { describe, expect, it, vi } from "vitest";

vi.mock("src/service-container/index", () => ({
  container: {
    notification: {
      notify: vi.fn(),
    },
  },
}));

vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) => value,
  stringToDate: (value: string) => new Date(value.replace(/\//g, "-")),
}));

vi.mock("src/core/NGConverter", () => ({
  convertUserToInternal: vi.fn(),
}));

describe("NG DSL parsing", () => {
  it("parses multiline function-style DSL with word and sites arrays", async () => {
    const { parse, TYPE } = await import("src/core/NG");

    const rules = parse(
      `RegExpHighlightTitle(\n  word="VTuber",\n  sites=[\n    eddibb.cc,\n    5ch.net,\n  ],\n  bgColor=red,\n  label=注目,\n)`,
    );

    const parsed = Array.from(rules as Set<unknown>);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.REG_EXP_HIGHLIGHT_TITLE,
      word: "VTuber",
      scope: {
        value: ["eddibb.cc", "5ch.net"],
      },
      params: {
        bgColor: "red",
        label: "注目",
      },
    });
  });

  it("accepts a positional first argument as the word in the new DSL", async () => {
    const { parse, TYPE } = await import("src/core/NG");

    const rules = parse(
      `RegExpHighlightTitle("VTuber", sites=[eddibb.cc, 5ch.net], bgColor=red, label="注目")`,
    );
    const parsed = Array.from(rules as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.REG_EXP_HIGHLIGHT_TITLE,
      word: "VTuber",
      scope: {
        value: ["eddibb.cc", "5ch.net"],
      },
      params: {
        bgColor: "red",
        label: "注目",
      },
    });
  });

  it("accepts the RegExpID keyword alias using new DSL", async () => {
    const { parse, TYPE } = await import("src/core/NG");

    const rules = parse('RegExpID("abc123")');
    const parsed = Array.from(rules as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.REG_EXP_ID,
      word: "abc123",
    });
  });

  it("handles non-DSL formats as simple Word NG", async () => {
    const { parse, TYPE } = await import("src/core/NG");

    const rules = parse("some raw text here");
    const parsed = Array.from(rules as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.WORD,
      word: "some raw text here",
    });
  });

  it("handles old legacy prefix formats as simple Word NG (dropped legacy syntax)", async () => {
    const { parse, TYPE } = await import("src/core/NG");

    const rules = parse("ID:abc123");
    const parsed = Array.from(rules as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.WORD,
      word: "ID:abc123",
    });
  });
});

import { describe, expect, it, vi } from "vitest";

const configStore = new Map<string, string>();

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => configStore.get(key) ?? null,
      set: (key: string, value: string) => {
        configStore.set(key, value);
      },
    },
    toast: {
      notify: vi.fn(),
    },
    message: {
      send: vi.fn(),
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
  it("falls back to ngwords when ngobj is empty", async () => {
    configStore.clear();
    configStore.set(
      "ngwords",
      'HighlightTitle(word="トリッカル" sites=["eddibb.cc"] bgColor=red label="注目")',
    );
    configStore.set("ngobj", "[]");

    const { get, invalidateCache, TYPE } = await import("src/core/NG");
    invalidateCache();

    const parsed = Array.from(get() as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.HIGHLIGHT_TITLE,
      word: "トリッカル",
      scope: {
        value: "eddibb.cc",
      },
      params: {
        bgColor: "red",
        label: "注目",
      },
    });
  });

  it("falls back to ngwords when ngobj is malformed JSON", async () => {
    configStore.clear();
    configStore.set(
      "ngwords",
      'RegExpBody(word="(imgur\\\\.com\\\\/.+?){15}")',
    );
    configStore.set("ngobj", "{broken-json");

    const { get, invalidateCache, TYPE } = await import("src/core/NG");
    invalidateCache();

    const parsed = Array.from(get() as Set<unknown>);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: TYPE.REG_EXP_BODY,
      word: "(imgur\\\\.com\\\\/.+?){15}",
    });
  });

  it("parses multiline function-style DSL with word and sites arrays", async () => {
    configStore.clear();
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
    configStore.clear();
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
    configStore.clear();
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
    configStore.clear();
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
    configStore.clear();
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

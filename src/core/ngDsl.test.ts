import {
  extractNgDslFunctionCall,
  getNgDslRuleSpec,
  normalizeNgDslKeyword,
  parseNgDslArguments,
  splitNgDslEntries,
} from "src/core/ngDsl";
import { describe, expect, it } from "vite-plus/test";

describe("NG DSL helpers", () => {
  it("keeps multiline function syntax as a single logical entry", () => {
    const entries = splitNgDslEntries(
      `RegExpHighlightTitle(\n  word="VTuber"\n  sites=[\n    eddibb.cc\n    5ch.net\n  ]\n  bgColor=red\n)\nBody(word="荒らし")`,
    );

    expect(entries).toEqual([
      `RegExpHighlightTitle(\n  word="VTuber"\n  sites=[\n    eddibb.cc\n    5ch.net\n  ]\n  bgColor=red\n)`,
      `Body(word="荒らし")`,
    ]);
  });

  it("parses named arguments including word and sites arrays", () => {
    const extracted = extractNgDslFunctionCall(
      `RegExpHighlightTitle(\n  word="VTuber"\n  sites=[\n    eddibb.cc\n    5ch.net\n  ]\n  bgColor=red\n  label=注目\n)`,
    );

    expect(extracted).not.toBeNull();
    expect(extracted?.keyword).toBe("RegExpHighlightTitle");
    expect(parseNgDslArguments(extracted?.argsSource ?? "")).toEqual({
      word: "VTuber",
      scope: ["eddibb.cc", "5ch.net"],
      params: {
        bgColor: "red",
        label: "注目",
      },
    });
  });

  it("treats the first bare argument as word when using the new function-only DSL", () => {
    const extracted = extractNgDslFunctionCall(
      `RegExpHighlightTitle("VTuber" sites=[eddibb.cc 5ch.net] bgColor=red)`,
    );

    expect(
      parseNgDslArguments(extracted?.argsSource ?? "", {
        positionalWord: true,
      }),
    ).toEqual({
      word: "VTuber",
      scope: ["eddibb.cc", "5ch.net"],
      params: {
        bgColor: "red",
      },
    });
  });

  it("still accepts the legacy colon suffix and scope name", () => {
    const extracted = extractNgDslFunctionCall(
      `RegExpHighlightTitle(scope=[eddibb.cc 5ch.net] bgColor=red): VTuber`,
    );

    expect(extracted?.valueSource).toBe("VTuber");
    expect(parseNgDslArguments(extracted?.argsSource ?? "")).toEqual({
      scope: ["eddibb.cc", "5ch.net"],
      params: {
        bgColor: "red",
      },
    });
  });

  it("normalizes legacy keyword aliases for editor-facing DSL", () => {
    expect(normalizeNgDslKeyword("RegExpID")).toBe("RegExpId");
    expect(normalizeNgDslKeyword("id")).toBe("ID");
  });

  it("treats double-backslash quoted regex input as a single-backslash pattern", () => {
    const extracted = extractNgDslFunctionCall(
      'RegExpBody(word="(imgur\\\\.com\\\\/.+?){15}")',
    );

    expect(parseNgDslArguments(extracted?.argsSource ?? "")).toEqual({
      word: "(imgur\\.com\\/.+?){15}",
    });
  });

  it("does not register the deprecated Word keyword as a DSL rule", () => {
    expect(getNgDslRuleSpec("Word")).toBeNull();
  });
});

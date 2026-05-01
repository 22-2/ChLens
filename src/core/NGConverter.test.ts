import { describe, expect, it, vi } from "vitest";
import { convertUserToInternal, tryParseJSON5Rules } from "src/core/NGConverter";

vi.mock("src/core/NG.js", () => ({
  TYPE: {
    REG_EXP: "RegExp",
    REG_EXP_TITLE: "RegExpTitle",
    REG_EXP_HIGHLIGHT_TITLE: "RegExpHighlightTitle",
    REG_EXP_NAME: "RegExpName",
    REG_EXP_MAIL: "RegExpMail",
    REG_EXP_ID: "RegExpId",
    REG_EXP_SLIP: "RegExpSlip",
    REG_EXP_BODY: "RegExpBody",
    REG_EXP_URL: "RegExpUrl",
    TITLE: "Title",
    HIGHLIGHT_TITLE: "HighlightTitle",
    NAME: "Name",
    MAIL: "Mail",
    ID: "ID",
    SLIP: "Slip",
    BODY: "Body",
    WORD: "Word",
    URL: "Url",
    RES_COUNT: "ResCount",
    AUTO: "Auto",
  },
  parse: vi.fn(() => new Set()),
}));

describe("NGConverter JSON5 parsing", () => {
  it("treats comment-prefixed JSON5 as JSON5 instead of DSL", () => {
    const rules = tryParseJSON5Rules(`// migrated config\n[\n  {\n    word: \"ID:WfiMRoM4i\",\n    type: \"ng\",\n    target: \"id\",\n  },\n]`);

    expect(rules).not.toBeNull();
    expect(rules).toEqual([
      {
        word: "ID:WfiMRoM4i",
        type: "ng",
        target: "id",
      },
    ]);
  });

  it("normalizes legacy lowercase JSON5 keys before internal conversion", () => {
    const rules = tryParseJSON5Rules(`[\n  {\n    word: \"foo\",\n    useregex: true,\n    type: \"highlight\",\n    target: \"title\",\n    highlightparams: {\n      bgcolor: \"orange\",\n      label: \"watch\",\n    },\n  },\n]`);

    expect(rules).not.toBeNull();

    const internalRules = convertUserToInternal(rules ?? []);

    expect(internalRules).toHaveLength(1);
    expect(internalRules[0]).toMatchObject({
      type: "RegExpHighlightTitle",
      word: "foo",
      params: {
        bgColor: "orange",
        label: "watch",
      },
    });
  });
});

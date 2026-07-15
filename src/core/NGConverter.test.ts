import {
  convertInternalToUser,
  convertUserToDSL,
  convertUserToInternal,
} from "src/core/NGConverter";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/NG", () => ({
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

describe("NGConverter", () => {
  it("keeps all scopes when converting to the internal NG format", () => {
    const internalRules = convertUserToInternal([
      {
        word: "foo",
        target: "body",
        scope: ["eddibb.cc", "5ch.net"],
      },
    ]);

    expect(internalRules[0]).toMatchObject({
      scope: {
        value: ["eddibb.cc", "5ch.net"],
      },
    });
  });

  it("serializes DSL with named arguments and scope arrays", () => {
    const dsl = convertUserToDSL([
      {
        word: "VTuber",
        type: "highlight",
        target: "title",
        scope: ["eddibb.cc", "5ch.net"],
        highlightParams: {
          bgColor: "red",
          label: "注目",
        },
      },
    ]);

    expect(dsl).toBe(
      "HighlightTitle(word=VTuber sites=[eddibb.cc 5ch.net] bgColor=red label=注目)",
    );
  });

  it("drops legacy ID prefixes when converting internal rules to user-facing rules", () => {
    const rules = convertInternalToUser([
      {
        type: "ID",
        word: "ID:abc123",
        exception: false,
      },
    ]);

    expect(rules).toEqual([
      {
        word: "abc123",
        type: "ng",
        target: "id",
      },
    ]);
  });
});

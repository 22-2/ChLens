import { parseNgString } from "src/core/NGParser";
import { TYPE } from "src/core/NGTypes";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) => value,
  stringToDate: (value: string) => new Date(value.replace(/\//g, "-")),
}));

describe("NGParser", () => {
  it("should parse new DSL syntax correctly", () => {
    const rules = Array.from(parseNgString('ID(word="abc")'));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      type: TYPE.ID,
      word: "abc",
    });
  });

  it("should treat old syntax as simple WORD NG", () => {
    const rules = Array.from(parseNgString("ID:abc"));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      type: TYPE.WORD,
      word: "ID:abc",
    });
  });

  it("should handle AND conditions using $[ ]$:", () => {
    const rules = Array.from(
      parseNgString('$[ID(word="xyz")]$:Title(word="abc")'),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe(TYPE.TITLE);
    expect(rules[0].word).toBe("abc");
    expect(rules[0].subElements).toHaveLength(1);
    expect(rules[0].subElements![0]).toMatchObject({
      type: TYPE.ID,
      word: "xyz",
    });
  });

  it("should extract modifier prefixes correctly", () => {
    const rules = Array.from(
      parseNgString('expireDate:2030/12/31,attachName:spam,ID(word="abc")'),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe(TYPE.ID);
    expect(rules[0].word).toBe("abc");
    expect(rules[0].name).toBe("spam");
    expect(rules[0].expire).toBeGreaterThan(Date.now());
  });

  it("should handle multiple entries separated by newlines", () => {
    const rules = Array.from(
      parseNgString(`ID(word="abc")\nTitle(word="def")`),
    );
    expect(rules).toHaveLength(2);
    expect(rules[0].type).toBe(TYPE.ID);
    expect(rules[0].word).toBe("abc");
    expect(rules[1].type).toBe(TYPE.TITLE);
    expect(rules[1].word).toBe("def");
  });

  it("should ignore // comment lines in DSL", () => {
    const rules = Array.from(
      parseNgString(`// コメント\nID(word="abc")\n// もう1行\nTitle(word="def")`),
    );

    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      type: TYPE.ID,
      word: "abc",
    });
    expect(rules[1]).toMatchObject({
      type: TYPE.TITLE,
      word: "def",
    });
  });
});

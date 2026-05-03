import { describe, expect, it, vi } from "vitest";
import { checkWord, checkScope, checkResNum } from "src/core/NGMatcher";
import { TYPE } from "src/core/NGTypes";

vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) => value,
}));

describe("NGMatcher", () => {
  describe("checkWord", () => {
    it("should match ID NG", () => {
      const result = checkWord(
        { type: TYPE.ID, word: "TestImage" },
        { id: "xyz_TestImage_def", all: "", name: "", mail: "", mes: "", title: "", url: "" }
      );
      expect(result).toBe(TYPE.ID);
    });

    it("should match Title NG", () => {
      const result = checkWord(
        { type: TYPE.TITLE, word: "NGTitle" },
        { title: "This is a NGTitle here", all: "", name: "", mail: "", mes: "", id: null, slip: null, url: "" }
      );
      expect(result).toBe(TYPE.TITLE);
    });

    it("should return null when no match", () => {
      const result = checkWord(
        { type: TYPE.ID, word: "TestImage" },
        { id: "different_id", all: "", name: "", mail: "", mes: "", title: "", url: "" }
      );
      expect(result).toBeNull();
    });
  });

  describe("checkScope", () => {
    it("should return true for global scope '*'", () => {
      expect(
        checkScope({ type: TYPE.ID, word: "abc", scope: { value: "*" } }, "http://example.com/test/read.cgi/board/123/")
      ).toBe(true);
    });

    it("should match specific domain", () => {
      expect(
        checkScope({ type: TYPE.ID, word: "abc", scope: { value: "example.com" } }, "http://example.com/test/read.cgi/board/123/")
      ).toBe(true);
    });

    it("should match specific board", () => {
      expect(
        checkScope({ type: TYPE.ID, word: "abc", scope: { value: "board" } }, "http://example.com/test/read.cgi/board/123/")
      ).toBe(true);
    });

    it("should return false if scope does not match", () => {
      expect(
        checkScope({ type: TYPE.ID, word: "abc", scope: { value: "otherdomain.com" } }, "http://example.com/test/read.cgi/board/123/")
      ).toBe(false);
    });
  });

  describe("checkResNum", () => {
    it("should match single res number", () => {
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10" }, 10)).toBe(true);
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10" }, 11)).toBe(false);
    });

    it("should match range of res numbers", () => {
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10", finish: "20" }, 15)).toBe(true);
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10", finish: "20" }, 10)).toBe(true);
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10", finish: "20" }, 20)).toBe(true);
      expect(checkResNum({ type: TYPE.ID, word: "", start: "10", finish: "20" }, 21)).toBe(false);
    });
  });
});

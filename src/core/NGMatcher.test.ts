import { checkResNum, checkScope, checkWord } from "src/core/NGMatcher";
import { TYPE } from "src/core/NGTypes";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/jsutil", () => ({
  decodeCharReference: (value: string) => value,
  normalize: (value: string) => value.toLowerCase(),
}));

describe("NGMatcher", () => {
  describe("checkWord", () => {
    it("matches ReplyCount when the reply threshold is reached", () => {
      expect(
        checkWord(
          { type: TYPE.REPLY_COUNT, word: "3" },
          {
            replyCount: 3,
            all: "",
            name: "",
            mail: "",
            mes: "",
            title: "",
            url: "",
          },
        ),
      ).toBe(TYPE.REPLY_COUNT);

      expect(
        checkWord(
          { type: TYPE.REPLY_COUNT, word: "3" },
          {
            replyCount: 2,
            all: "",
            name: "",
            mail: "",
            mes: "",
            title: "",
            url: "",
          },
        ),
      ).toBeNull();
    });

    it("should match ID NG", () => {
      const result = checkWord(
        { type: TYPE.ID, word: "TestImage" },
        {
          id: "xyz_TestImage_def",
          all: "",
          name: "",
          mail: "",
          mes: "",
          title: "",
          url: "",
        },
      );
      expect(result).toBe(TYPE.ID);
    });

    it("should match ID NG even when stored word and response id differ in case", () => {
      const result = checkWord(
        { type: TYPE.ID, word: "mbmnczwh4" },
        {
          id: "mbMNczWH4",
          all: "",
          name: "",
          mail: "",
          mes: "",
          title: "",
          url: "",
        },
      );
      expect(result).toBe(TYPE.ID);
    });

    it("should match SLIP NG even when stored word and response slip differ in case", () => {
      const result = checkWord(
        { type: TYPE.SLIP, word: "slip-abcd" },
        {
          slip: "SLIP-ABCD",
          all: "",
          name: "",
          mail: "",
          mes: "",
          title: "",
          url: "",
        },
      );
      expect(result).toBe(TYPE.SLIP);
    });

    it("should match Title NG", () => {
      const result = checkWord(
        { type: TYPE.TITLE, word: "NGTitle" },
        {
          title: "This is a NGTitle here",
          all: "",
          name: "",
          mail: "",
          mes: "",
          id: null,
          slip: null,
          url: "",
        },
      );
      expect(result).toBe(TYPE.TITLE);
    });

    it("should return null when no match", () => {
      const result = checkWord(
        { type: TYPE.ID, word: "TestImage" },
        {
          id: "different_id",
          all: "",
          name: "",
          mail: "",
          mes: "",
          title: "",
          url: "",
        },
      );
      expect(result).toBeNull();
    });
  });

  describe("checkScope", () => {
    it("should return true for global scope '*'", () => {
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "*" } },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(true);
    });

    it("should match specific domain", () => {
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "example.com" } },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(true);
    });

    it("should match specific board", () => {
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "board" } },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(true);
    });

    it("should return false if scope does not match", () => {
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "otherdomain.com" } },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(false);
    });

    it("should match DOMAIN/BOARD when both domain and board match", () => {
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "example.com/board" } },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(true);
    });

    it("should not match DOMAIN/BOARD when domain matches but board differs", () => {
      expect(
        checkScope(
          {
            type: TYPE.ID,
            word: "abc",
            scope: { value: "example.com/otherboard" },
          },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(false);
    });

    it("should not match DOMAIN/BOARD when board is prefix of actual board name", () => {
      // "news" は "newsplus" の先頭と一致するが、ボード名の厳密照合なので false
      expect(
        checkScope(
          { type: TYPE.ID, word: "abc", scope: { value: "example.com/news" } },
          "http://example.com/test/read.cgi/newsplus/123/",
        ),
      ).toBe(false);
    });

    it("should not match DOMAIN/BOARD when domain differs", () => {
      expect(
        checkScope(
          {
            type: TYPE.ID,
            word: "abc",
            scope: { value: "other.com/board" },
          },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(false);
    });

    it("should match DOMAIN/BOARD with subdomain URL", () => {
      // 5ch.net 系スレッドURLは /test/read.cgi/{board}/{thread_id}/ の形式
      expect(
        checkScope(
          {
            type: TYPE.ID,
            word: "abc",
            scope: { value: "5ch.net/livejupiter" },
          },
          "https://livejupiter.5ch.net/test/read.cgi/livejupiter/1000000010/",
        ),
      ).toBe(true);
    });

    it("should match multiple scopes including DOMAIN/BOARD", () => {
      expect(
        checkScope(
          {
            type: TYPE.ID,
            word: "abc",
            scope: { value: ["other.com/board", "example.com/board"] },
          },
          "http://example.com/test/read.cgi/board/123/",
        ),
      ).toBe(true);
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

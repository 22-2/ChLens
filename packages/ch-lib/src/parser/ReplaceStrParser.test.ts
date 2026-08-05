import { describe, expect, it } from "vite-plus/test";
import { ReplaceStrParser } from "../parser/ReplaceStrParser";

describe("ReplaceStrParser", () => {
  describe("parse", () => {
    it("should parse simple replacement rules", () => {
      const text = "before\tafter\tmsg";
      const rules = ReplaceStrParser.parse(text);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: "ex",
        before: "before",
        after: "after",
        place: "msg",
      });
    });

    it("should parse rx rules", () => {
      const text = "<rx>before\tafter\tname";
      const rules = ReplaceStrParser.parse(text);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: "rx",
        before: "before",
        after: "after",
        place: "name",
      });
    });

    it("should ignore comments", () => {
      const text = "// comment\n; comment\n' comment\nvalid\tafter\tall";
      const rules = ReplaceStrParser.parse(text);
      expect(rules).toHaveLength(1);
      expect(rules[0].before).toBe("valid");
    });

    it("should parse URL patterns", () => {
      const text = "before\tafter\tall\t<0>example.com";
      const rules = ReplaceStrParser.parse(text);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        urlPattern: 0,
        url: "example.com",
      });
    });
  });

  describe("replace", () => {
    const rules = ReplaceStrParser.parse("foo\tbar\tmsg\n<rx>\\d+\tNUM\tall");
    const target = {
      name: "User 123",
      mail: "test@example.com",
      other: "2023/01/01",
      message: "hello foo 456",
    };

    it("should replace content based on rules", () => {
      const result = ReplaceStrParser.replace("http://example.com", "title", target, rules);
      expect(result.message).toBe("hello bar NUM");
      expect(result.name).toBe("User NUM");
    });

    it("should respect URL filters", () => {
      const urlRules = ReplaceStrParser.parse("foo\tbar\tmsg\t<0>special.com");

      const res1 = ReplaceStrParser.replace("http://special.com/board", "title", target, urlRules);
      expect(res1.message).toBe("hello bar 456");

      const res2 = ReplaceStrParser.replace("http://other.com", "title", target, urlRules);
      expect(res2.message).toBe("hello foo 456");
    });
  });
});

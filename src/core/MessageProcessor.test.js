import { describe, it, expect } from "vitest";
import MessageProcessor from "./MessageProcessor.js";

describe("MessageProcessor", () => {
  describe("decode", () => {
    it("should convert URLs to anchor tags", () => {
      const res = {
        name: "テスト名前",
        mail: "",
        other: "2026/03/06(金) 13:25:49.264 ID:test123",
        message:
          "ちな復旧自体は進んでるで<br>https://i.imgur.com/TestImageA.jpeg<br>https://i.imgur.com/TestImageB.jpeg<br>",
        id: "ID:test123",
        date: "2026/03/06(金) 13:25:49.264",
      };

      const result = MessageProcessor.decode(res, "https:");

      // URLが<a>タグに変換されていることを確認
      expect(result.messageHtml).toContain('<a href="https://i.imgur.com/TestImageA.jpeg"');
      expect(result.messageHtml).toContain('<a href="https://i.imgur.com/TestImageB.jpeg"');
      expect(result.messageHtml).toContain("target=\"_blank\"");
      expect(result.messageHtml).toContain("rel=\"noopener noreferrer\"");
    });

    it("should handle http URLs", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message: "テストhttp://example.com/test",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain('<a href="http://example.com/test"');
    });

    it("should handle URLs with query parameters", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message: "https://example.com/path?param=value&other=123",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain(
        '<a href="https://example.com/path?param=value&other=123"'
      );
    });

    it("should not double-convert already linked URLs", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message: '<a href="https://example.com">https://example.com</a>',
      };

      const result = MessageProcessor.decode(res, "https:");
      // 既にリンクになっているものは二重変換しない
      const linkCount = (result.messageHtml.match(/<a href=/g) || []).length;
      expect(linkCount).toBe(1);
    });
  });
});

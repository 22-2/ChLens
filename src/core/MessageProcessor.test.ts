import MessageProcessor from "src/core/MessageProcessor";
import { describe, expect, it } from "vite-plus/test";

describe("レス本文の表示処理", () => {
  describe("デコード", () => {
    it("URLをアンカータグへ変換する", () => {
      const res = {
        name: "テスト名前",
        mail: "",
        other: "2026/03/06(金) 13:25:49.264 ID:test123",
        message:
          "画像テスト<br>https://i.imgur.com/TestImageA.jpeg<br>https://i.imgur.com/TestImageB.jpeg<br>",
        id: "ID:test123",
        date: "2026/03/06(金) 13:25:49.264",
      };

      const result = MessageProcessor.decode(res, "https:");

      // URLが<a>タグに変換されていることを確認
      expect(result.messageHtml).toContain('<a href="https://i.imgur.com/TestImageA.jpeg"');
      expect(result.messageHtml).toContain('<a href="https://i.imgur.com/TestImageB.jpeg"');
      expect(result.messageHtml).toContain('target="_blank"');
      expect(result.messageHtml).toContain('rel="noopener noreferrer"');
    });

    it("httpのURLを処理する", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message: "テストhttp://example.com/test",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain('<a href="http://example.com/test"');
    });

    it("dat内のアンカーをアンカーリンクとして表示する", () => {
      const result = MessageProcessor.decode(
        {
          name: "名無し",
          mail: "",
          other: "",
          message: ">>3",
        },
        "https:",
      );

      const anchorText = result.messageHtml.match(
        /<a\b[^>]*class="anchor[^"]*"[^>]*>([\s\S]*?)<\/a>/,
      )?.[1];
      expect(anchorText).toBe(">>3");
    });

    it("短縮プロトコルのURLを復元する", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message:
          "s://pbs.twimg.com/media/TestTwitterImageA.jpg ps://pbs.twimg.com/media/TestTwitterImageB.jpg p://i.imgur.com/TestImageC.jpg",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain(
        '<a href="https://pbs.twimg.com/media/TestTwitterImageA.jpg" target="_blank" rel="noopener noreferrer">s://pbs.twimg.com/media/TestTwitterImageA.jpg</a>',
      );
      expect(result.messageHtml).toContain(
        '<a href="https://pbs.twimg.com/media/TestTwitterImageB.jpg" target="_blank" rel="noopener noreferrer">ps://pbs.twimg.com/media/TestTwitterImageB.jpg</a>',
      );
      expect(result.messageHtml).toContain(
        '<a href="http://i.imgur.com/TestImageC.jpg" target="_blank" rel="noopener noreferrer">p://i.imgur.com/TestImageC.jpg</a>',
      );
    });

    it("クエリパラメーター付きURLを処理する", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message: "https://example.com/path?param=value&other=123",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain(
        '<a href="https://example.com/path?param=value&other=123"',
      );
    });

    it("全角括弧で囲まれたURLを解析する", () => {
      const res = {
        name: "テスト",
        mail: "",
        other: "",
        message:
          "project-a（https://example.test/project-a）とかproject-b（https://example.test/project-b）を確認する",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.messageHtml).toContain(
        '<a href="https://example.test/project-a" target="_blank" rel="noopener noreferrer">https://example.test/project-a</a>',
      );
      expect(result.messageHtml).toContain(
        '<a href="https://example.test/project-b" target="_blank" rel="noopener noreferrer">https://example.test/project-b</a>',
      );
      expect(result.messageHtml).not.toContain(
        "https://example.test/project-a）とかproject-b（https://example.test/project-b",
      );
    });

    it("リンク済みURLを二重変換しない", () => {
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

    it("otherHtmlにIDとSLIPを表示する", () => {
      const res = {
        name: "テスト </b>(L20 abcd-efgh)<b>",
        mail: "",
        other: "2026/03/06(金) 13:25:49.264 ID:test123",
        id: "ID:test123",
        slip: "L20 abcd-efgh",
        date: "2026/03/06(金) 13:25:49.264",
      };

      const result = MessageProcessor.decode(res, "https:");
      expect(result.otherHtml).toContain('<span class="slip">SLIP:L20 abcd-efgh</span>');
      expect(result.otherHtml).toContain('<span class="id">ID:test123</span>');
    });

    it("名前欄の色指定spanを保持する", () => {
      const result = MessageProcessor.decode(
        {
          name: '風吹けば名無し <span style="color:green;">警備員[Lv.10]</span>',
          mail: "",
          other: "",
        },
        "https:",
      );

      expect(result.nameHtml).toContain('<span style="color:green;">警備員[Lv.10]</span>');
    });

    it("許可されていない名前属性をエスケープする", () => {
      const result = MessageProcessor.decode(
        {
          name: '<span onclick="alert(1)">危険</span>',
          mail: "",
          other: "",
        },
        "https:",
      );

      expect(result.nameHtml).toContain('&lt;span onclick="alert(1)">');
      expect(result.nameHtml).not.toContain('<span onclick="alert(1)">');
    });
  });
});

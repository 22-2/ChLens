import MessageProcessor from "src/core/thread/MessageProcessor";
import { describe, expect, it } from "vite-plus/test";

import { sanitizeMessageHtml } from "./sanitize-message-html";

describe("レス本文のサニタイズ", () => {
  it("script・iframe・form・img などの許可外タグを落とす", () => {
    const html = sanitizeMessageHtml(
      '本文<script>alert(1)</script><iframe src="https://example.com/"></iframe><form action="https://example.com/"><input></form><img src="https://example.com/a.png">',
    );

    expect(html).toBe("本文");
  });

  it("イベント属性・style属性・javascript: URLを落とす", () => {
    const html = sanitizeMessageHtml(
      '<a href="javascript:alert(1)" onclick="alert(1)" style="color:red">リンク</a><b onmouseover="alert(1)">太字</b>',
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).not.toContain("style");
    expect(html).toContain("リンク");
    expect(html).toContain("<b>太字</b>");
  });

  it("本文の改行と装飾タグは維持する", () => {
    expect(sanitizeMessageHtml("一行目<br>二行目<b>太字</b>")).toBe("一行目<br>二行目<b>太字</b>");
  });

  it("decodeが生成するリンクとアンカーの属性を維持する", () => {
    const { messageHtml } = MessageProcessor.decode(
      { name: "", mail: "", message: "&gt;&gt;1 https://example.com/page" },
      "https:",
    );

    expect(messageHtml).toContain('href="https://example.com/page"');
    expect(messageHtml).toContain('target="_blank"');
    expect(messageHtml).toContain('rel="noopener noreferrer"');
    expect(messageHtml).toContain('role="link"');
    expect(messageHtml).toContain('tabindex="0"');
    expect(messageHtml).toContain('class="anchor');
  });

  it("decodeで本文に混ぜられたscriptタグは残らない", () => {
    const { messageHtml } = MessageProcessor.decode(
      {
        name: "",
        mail: "",
        message: '<script>alert(1)</script><img src=x onerror="alert(1)">本文',
      },
      "https:",
    );

    expect(messageHtml).not.toContain("<script");
    expect(messageHtml).not.toContain("onerror");
  });
});

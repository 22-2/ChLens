// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { parseMessage } from "../parser/MessageParser";

describe("MessageParser", () => {
  it("BEアイコンのsssp URLをhttpsリンクへ変換する", () => {
    expect(parseMessage("sssp://example.com/ico/001.gif", { protocol: "http:" })).toEqual([
      {
        type: "url",
        value: "sssp://example.com/ico/001.gif",
        href: "https://example.com/ico/001.gif",
      },
    ]);
  });

  it("parses anchors, IDs, and URLs into semantic tokens", () => {
    const tokens = parseMessage(">>3 id:abc https://example.com/page", {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      {
        type: "anchor",
        value: ">>3",
        data: { targetCount: 1, segments: [[3, 3]] },
      },
      { type: "text", value: " " },
      { type: "id", value: "id:abc" },
      { type: "text", value: " " },
      { type: "url", value: "https://example.com/page", href: "https://example.com/page" },
    ]);
  });

  it("preserves sentence punctuation outside URL tokens", () => {
    const tokens = parseMessage("https://example.com/page.", { protocol: "https:" });

    expect(tokens).toEqual([
      { type: "url", value: "https://example.com/page", href: "https://example.com/page" },
      { type: "text", value: "." },
    ]);
  });

  it("does not linkify URLs inside existing anchor markup", () => {
    const tokens = parseMessage('<a href="https://example.com">https://example.com</a>', {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      { type: "tag", value: '<a href="https://example.com">' },
      { type: "text", value: "https://example.com" },
      { type: "tag", value: "</a>" },
    ]);
  });

  it("既存アンカーのラベルを保ち、中継URLのhrefだけをデコードして展開する", () => {
    const tokens = parseMessage(
      '<a href="https://jump.5ch.net/?https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2">元のラベル</a>',
      { protocol: "https:" },
    );

    expect(tokens).toEqual([
      { type: "tag", value: '<a href="https://example.com/?a=1&amp;b=2">' },
      { type: "text", value: "元のラベル" },
      { type: "tag", value: "</a>" },
    ]);
  });

  it("data-hrefやtitle内の文字列ではなくhref属性だけを展開する", () => {
    const wrapper = `https://jump.5ch.net/?${encodeURIComponent("https://example.com/target")}`;
    const tokens = parseMessage(
      `<a data-href="${wrapper}" title="href='${wrapper}'" href="${wrapper}">元ラベル</a>`,
      { protocol: "https:" },
    );

    expect(tokens[0]).toEqual({
      type: "tag",
      value: `<a data-href="${wrapper}" title="href='${wrapper}'" href="https://example.com/target">`,
    });
    expect(tokens[1]).toEqual({ type: "text", value: "元ラベル" });
  });

  it("single-quote属性を安全な引用符へ直し、apostropheと$置換記号を保持する", () => {
    const target = "https://example.com/it's?value=$&next=$$";
    const encodedTarget = encodeURIComponent(target).replaceAll("'", "%27");
    const wrapper = `https://jump.5ch.net/?${encodedTarget}`;
    const tokens = parseMessage(`<a href='${wrapper}'>元のラベル</a>`, { protocol: "https:" });

    expect(tokens).toEqual([
      { type: "tag", value: '<a href="https://example.com/it\'s?value=$&amp;next=$$">' },
      { type: "text", value: "元のラベル" },
      { type: "tag", value: "</a>" },
    ]);
  });

  it("遷移先の引用符をURLエンコードして属性注入を防ぐ", () => {
    const target = "https://example.com/%22%20onclick%3D%22alert(1)";
    const wrapper = `https://jump.5ch.net/?${encodeURIComponent(target)}`;
    const tokens = parseMessage(`<a href='${wrapper}'>ラベル</a>`, { protocol: "https:" });

    expect(tokens[0]).toEqual({
      type: "tag",
      value: '<a href="https://example.com/%22%20onclick%3D%22alert(1)">',
    });
  });

  it("HTML entityを1回だけ戻し、URL内の二重entityやpercent encodeを保つ", () => {
    const encodedTarget = encodeURIComponent("https://example.com/path?token=%26amp%3B");
    const tokens = parseMessage(`<a href="https://jump.5ch.net/?${encodedTarget}">ラベル</a>`, {
      protocol: "https:",
    });
    const doubleEntityTokens = parseMessage(
      '<a href="https://jump.5ch.net/?https://example.com/path?token=&amp;amp;">ラベル</a>',
      { protocol: "https:" },
    );

    expect(tokens[0]).toEqual({
      type: "tag",
      value: '<a href="https://example.com/path?token=%26amp%3B">',
    });
    expect(doubleEntityTokens[0]).toEqual({
      type: "tag",
      value: '<a href="https://example.com/path?token=&amp;amp;">',
    });
  });

  it("normalizes protocol-relative image sources before parsing URLs", () => {
    const tokens = parseMessage('<img src="//i.imgur.com/example.jpg">', {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      {
        type: "url",
        value: "https://i.imgur.com/example.jpg",
        href: "https://i.imgur.com/example.jpg",
      },
    ]);
  });

  it("uses the message protocol for URLs without a scheme", () => {
    const tokens = parseMessage("://example.com/path", { protocol: "http:" });

    expect(tokens).toEqual([
      {
        type: "url",
        value: "://example.com/path",
        href: "http://example.com/path",
      },
    ]);
  });

  it("スラッシュが1本だけのURLをリンク化してhrefを補正する", () => {
    const tokens = parseMessage("https:/example.com/image.jpeg", {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      {
        type: "url",
        value: "https:/example.com/image.jpeg",
        href: "https://example.com/image.jpeg",
      },
    ]);
  });

  it("スラッシュが1本だけのimg srcをURLトークンへ変換する", () => {
    const tokens = parseMessage('<img src="https:/example.com/image.jpeg">', {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      {
        type: "url",
        value: "https://example.com/image.jpeg",
        href: "https://example.com/image.jpeg",
      },
    ]);
  });

  it("省略スキームの後ろに完全なURLが続く画像URLを正しく解釈する", () => {
    const tokens = parseMessage("ps://https://i.imgur.com/jZia7GC.png", {
      protocol: "https:",
    });

    expect(tokens).toEqual([
      {
        type: "url",
        value: "ps://https://i.imgur.com/jZia7GC.png",
        href: "https://i.imgur.com/jZia7GC.png",
      },
    ]);
  });

  it("スキームを省略したホスト名URLを絶対リンクへ変換する", () => {
    expect(parseMessage("images.example.com/media/sample.jpg", { protocol: "https:" })).toEqual([
      {
        type: "url",
        value: "images.example.com/media/sample.jpg",
        href: "https://images.example.com/media/sample.jpg",
      },
    ]);
  });
});

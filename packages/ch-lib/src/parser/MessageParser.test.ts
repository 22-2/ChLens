import { describe, expect, it } from "vite-plus/test";
import { parseMessage } from "../parser/MessageParser";

describe("MessageParser", () => {
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
});

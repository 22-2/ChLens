import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("webextension-polyfill", () => ({ default: {} }));

import { parseEdgeArchivePage } from "./edge-archive-source";

describe("エッヂ過去ログ索引の解析", () => {
  it("タイトルとレス数を解析する", () => {
    const result = parseEdgeArchivePage(
      `<p id="result">検索結果：1件</p><div id="threadContainer"><div class="thread"><a class="title" href="/test/read.cgi/liveedge/1601000000/">架空の番組 &amp; 実況 (42)</a></div></div>`,
    );
    expect(result.total).toBe(1);
    expect(result.threads[0]).toMatchObject({
      title: "架空の番組 & 実況",
      createdAtSeconds: 1601000000,
      responseCount: 42,
    });
  });

  it("形式変更や対応外のリンクをエラーにする", () => {
    expect(() => parseEdgeArchivePage("<html></html>")).toThrow();
    expect(() =>
      parseEdgeArchivePage(
        `<p id="result">検索結果：1件</p><div id="threadContainer"><div class="thread"><a class="title" href="https://example.com/">架空 (1)</a></div></div>`,
      ),
    ).toThrow();
  });
});

import { describe, expect, it, vi } from "vite-plus/test";

const httpFetch = vi.hoisted(() => vi.fn());
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: httpFetch } } }));

vi.mock("webextension-polyfill", () => ({ default: {} }));

import { fetchEdgeArchive, parseEdgeArchivePage } from "./edge-archive-source";

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

  it("同日の検索でも終了日全体を含むよう翌日を索引へ渡す", async () => {
    httpFetch.mockResolvedValue({
      status: 200,
      body: '<p id="result">検索結果：0件</p><div id="threadContainer"></div>',
    });
    await fetchEdgeArchive(
      "架空",
      Date.parse("2020-09-25T00:00:00+09:00") / 1000,
      Date.parse("2020-09-25T23:59:00+09:00") / 1000,
    );
    const url = new URL(httpFetch.mock.calls.at(-1)?.[0]);
    expect(url.searchParams.get("start_date")).toBe("2020-09-25");
    expect(url.searchParams.get("end_date")).toBe("2020-09-26");
  });
});

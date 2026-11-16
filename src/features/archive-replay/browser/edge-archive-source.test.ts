import { describe, expect, it, vi } from "vite-plus/test";

const httpFetch = vi.hoisted(() => vi.fn());
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: httpFetch } } }));

vi.mock("webextension-polyfill", () => ({ default: {} }));

import {
  fetchEdgeArchive,
  fetchEdgeArchiveRange,
  parseEdgeArchivePage,
} from "./edge-archive-source";

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
    await fetchEdgeArchiveRange(
      "架空",
      Date.parse("2020-09-25T00:00:00+09:00") / 1000,
      Date.parse("2020-09-25T23:59:00+09:00") / 1000,
    );
    const url = new URL(httpFetch.mock.calls.at(-1)?.[0]);
    expect(url.searchParams.get("start_date")).toBe("2020-09-25");
    expect(url.searchParams.get("end_date")).toBe("2020-09-26");
  });

  it("日付だけで索引を二分探索し、時刻範囲の題名を集める", async () => {
    httpFetch.mockReset();
    httpFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const page = Number(url.searchParams.get("page"));
      const rows = Array.from({ length: 50 }, (_, index) => {
        const key = 1601001000 - ((page - 1) * 50 + index);
        return `<div class="thread"><a class="title" href="/test/read.cgi/liveedge/${key}/">架空番組 ${key} (10)</a></div>`;
      }).join("");
      return {
        status: 200,
        body: `<p id="result">検索結果：250件</p><div id="threadContainer">${rows}</div>`,
      };
    });
    const result = await fetchEdgeArchiveRange("", 1601000800, 1601000825);
    expect(result.threads).toHaveLength(26);
    expect(result.threads[0].createdAtSeconds).toBe(1601000825);
    expect(result.threads.at(-1)?.createdAtSeconds).toBe(1601000800);
    expect(result.truncated).toBe(false);
    expect(
      httpFetch.mock.calls.every(([input]) => new URL(input).searchParams.get("keyword") === ""),
    ).toBe(true);
    expect(httpFetch.mock.calls.length).toBeLessThan(6);
  });

  it("索引のページ上限に達したら途中結果と不足を返す", async () => {
    httpFetch.mockReset();
    httpFetch.mockImplementation(async (input: string) => {
      const page = Number(new URL(input).searchParams.get("page"));
      const rows = Array.from({ length: 50 }, (_, index) => {
        const key = 1601001000 - ((page - 1) * 50 + index);
        return `<div class="thread"><a class="title" href="/test/read.cgi/liveedge/${key}/">架空 (10)</a></div>`;
      }).join("");
      return {
        status: 200,
        body: `<p id="result">検索結果：600件</p><div id="threadContainer">${rows}</div>`,
      };
    });
    const result = await fetchEdgeArchiveRange("", 1601000000, 1601001000);
    expect(result.threads).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("広い一覧が上限に達しても検索語に一致する古いスレを取得する", async () => {
    httpFetch.mockReset();
    httpFetch.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const page = Number(url.searchParams.get("page"));
      const matching = url.searchParams.get("keyword") === "架空番組";
      const total = matching ? 5 : 600;
      const count = matching ? 5 : 50;
      const rows = Array.from({ length: count }, (_, index) => {
        const key = matching ? 1601000400 - index : 1601001000 - ((page - 1) * 50 + index);
        return `<div class="thread"><a class="title" href="/test/read.cgi/liveedge/${key}/">${matching ? "架空番組" : "別スレ"} (10)</a></div>`;
      }).join("");
      return {
        status: 200,
        body: `<p id="result">検索結果：${total}件</p><div id="threadContainer">${rows}</div>`,
      };
    });
    const result = await fetchEdgeArchive("架空番組", 1601000000, 1601001000);
    expect(result.threads.filter((thread) => thread.title === "架空番組")).toHaveLength(5);
    expect(result.matchingTruncated).toBe(false);
    expect(result.broadTruncated).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("片方の索引が失敗しても取得できた候補と失敗理由を返す", async () => {
    httpFetch.mockReset();
    httpFetch.mockImplementation(async (input: string) => {
      if (!new URL(input).searchParams.get("keyword")) throw new Error("通信失敗");
      return {
        status: 200,
        body: '<p id="result">検索結果：1件</p><div id="threadContainer"><div class="thread"><a class="title" href="/test/read.cgi/liveedge/1601000000/">架空番組 (1)</a></div></div>',
      };
    });
    const result = await fetchEdgeArchive("架空番組", 1600999999, 1601000001);
    expect(result.threads).toHaveLength(1);
    expect(result.failures).toEqual(["続き候補の過去ログ一覧を取得できませんでした。"]);
  });
});

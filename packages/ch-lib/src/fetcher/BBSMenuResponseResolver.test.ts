import { describe, expect, it } from "vite-plus/test";

import { parseLastModifiedHeader, resolveBBSMenuResponse } from "./BBSMenuResponseResolver";

describe("resolveBBSMenuResponse", () => {
  it("200では新しい本文と検証用ヘッダーを返す", () => {
    expect(
      resolveBBSMenuResponse({
        response: {
          status: 200,
          body: "new",
          headers: { "Last-Modified": "Tue, 06 Oct 2026 00:00:00 GMT", ETag: '"v2"' },
        },
        cachedBody: "old",
      }),
    ).toEqual({
      kind: "fresh",
      body: "new",
      lastModified: Date.UTC(2026, 9, 6),
      etag: '"v2"',
    });
  });

  it("304では保存済みの本文を使い、確認日時の更新対象にする", () => {
    expect(
      resolveBBSMenuResponse({
        response: { status: 304, body: "", headers: {} },
        cachedBody: "old",
      }),
    ).toEqual({ kind: "not-modified", body: "old" });
  });

  it("通信しなかった場合や失敗した場合は保存済みの本文を使う", () => {
    expect(resolveBBSMenuResponse({ cachedBody: "old" })).toEqual({ kind: "cached", body: "old" });
    expect(
      resolveBBSMenuResponse({
        response: { status: 503, body: "", headers: {} },
        cachedBody: "old",
      }),
    ).toEqual({ kind: "cached", body: "old" });
  });

  it("使える本文がない場合は例外にする", () => {
    expect(() =>
      resolveBBSMenuResponse({
        response: { status: 503, body: "", headers: {} },
        cachedBody: null,
      }),
    ).toThrow("板一覧の取得に失敗しました");
  });
});

describe("parseLastModifiedHeader", () => {
  it("不正な値や空の値はundefinedにする", () => {
    expect(parseLastModifiedHeader(undefined)).toBeUndefined();
    expect(parseLastModifiedHeader("invalid")).toBeUndefined();
  });
});

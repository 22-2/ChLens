// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { normalizeObfuscatedUrl, unwrap5chJumpUrl, URL_LIKE_PATTERN } from "./text";

describe("URL本文の補助関数", () => {
  it("BEアイコンのssspスキームをhttpsの画像URLとして扱う", () => {
    const url = "sssp://example.com/ico/001.gif";
    expect(url.match(URL_LIKE_PATTERN)).toEqual([url]);
    expect(normalizeObfuscatedUrl(url, "http:")).toBe("https://example.com/ico/001.gif");
  });

  it("スキームのないURLを既定のhttpsで正規化する", () => {
    expect(normalizeObfuscatedUrl("://example.com/path")).toBe("https://example.com/path");
  });

  it("スキーム後のスラッシュが1本だけのURLを正規化する", () => {
    const urls = ["http:/example.com/path", "https:/example.com/path"];

    for (const url of urls) {
      expect(url.match(URL_LIKE_PATTERN)).toEqual([url]);
      expect(normalizeObfuscatedUrl(url)).toBe(url.replace(":/", "://"));
    }
  });

  it("省略スキームの後ろに重複した完全URLがある形式を内側のURLへ正規化する", () => {
    expect(normalizeObfuscatedUrl("ps://https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("別のスキームの末尾にあるスキームなし部分を一致扱いしない", () => {
    expect("foo://example.com".match(URL_LIKE_PATTERN)).toBeNull();
  });

  it("スキームを省略したホスト名URLを画像URLとして扱う", () => {
    const url = "images.example.com/media/sample.jpg";

    expect(url.match(URL_LIKE_PATTERN)).toEqual([url]);
    expect(normalizeObfuscatedUrl(url)).toBe(`https://${url}`);
  });

  it("メールアドレスのドメイン部分だけをURLとして拾わない", () => {
    expect("user@example.com/media/sample.jpg".match(URL_LIKE_PATTERN)).toBeNull();
  });

  it("5chのルート中継URLから未エンコードのHTTP(S)リンクを取り出す", () => {
    expect(unwrap5chJumpUrl("https://jump.5ch.net/?https://example.com/path?q=a%2Fb")).toBe(
      "https://example.com/path?q=a%2Fb",
    );
  });

  it("HTTPの遷移先も中継URLから取り出す", () => {
    expect(unwrap5chJumpUrl("http://jump.5ch.net/?http://example.com/path")).toBe(
      "http://example.com/path",
    );
  });

  it("5chのルート中継URLからエンコードされたHTTP(S)リンクを取り出す", () => {
    const target = "https://example.com/path?q=a%2Fb#part";
    expect(unwrap5chJumpUrl(`https://jump.5ch.net/?${encodeURIComponent(target)}`)).toBe(target);
  });

  it("対象外ホスト・パス・形式のURLはそのまま返す", () => {
    const urls = [
      "https://sub.jump.5ch.net/?https://example.com/",
      "https://example.com/?https://example.org/",
      "https://jump.5ch.net/other?https://example.com/",
      "https://jump.5ch.net/",
      "https://jump.5ch.net/?https://example.com/path#fragment",
    ];
    for (const url of urls) expect(unwrap5chJumpUrl(url)).toBe(url);
  });

  it("危険なスキームや資格情報付きの遷移先は展開しない", () => {
    const urls = [
      "https://jump.5ch.net/?javascript%3Aalert(1)",
      "https://jump.5ch.net/?https%3A%2F%2Fexample.com%2F%ZZ",
      "https://jump.5ch.net/?https://example.com/%ZZ",
      "https://jump.5ch.net/?https%3A%2F%2Fuser%40example.com%2F",
      "https://jump.5ch.net/?https%3A%2F%2Fjump.5ch.net%2F%3Fhttps%253A%252F%252Fexample.com",
    ];
    for (const url of urls) expect(unwrap5chJumpUrl(url)).toBe(url);
  });
});

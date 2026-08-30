import { describe, expect, it } from "vite-plus/test";
import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "./text";

describe("URL本文の補助関数", () => {
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

  it("別のスキームの末尾にあるスキームなし部分を一致扱いしない", () => {
    expect("foo://example.com".match(URL_LIKE_PATTERN)).toBeNull();
  });
});

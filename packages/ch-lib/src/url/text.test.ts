import { describe, expect, it } from "vite-plus/test";
import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "./text";

describe("URL本文の補助関数", () => {
  it("スキームのないURLを既定のhttpsで正規化する", () => {
    expect(normalizeObfuscatedUrl("://example.com/path")).toBe("https://example.com/path");
  });

  it("別のスキームの末尾にあるスキームなし部分を一致扱いしない", () => {
    expect("foo://example.com".match(URL_LIKE_PATTERN)).toBeNull();
  });
});

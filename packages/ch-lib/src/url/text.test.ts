import { describe, expect, it } from "vite-plus/test";
import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "./text";

describe("URL text helpers", () => {
  it("normalizes scheme-less URLs with https by default", () => {
    expect(normalizeObfuscatedUrl("://example.com/path")).toBe("https://example.com/path");
  });

  it("does not match the scheme-less suffix of another scheme", () => {
    expect("foo://example.com".match(URL_LIKE_PATTERN)).toBeNull();
  });
});

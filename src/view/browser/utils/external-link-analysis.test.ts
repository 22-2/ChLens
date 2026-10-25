// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { analyzeExternalLink } from "./external-link-analysis";

describe("外部リンクの確認用解析", () => {
  it("既知の追跡キーと機能用パラメータを区別する", () => {
    const result = analyzeExternalLink(
      "https://example.com/article?id=42&utm_source=mail&fbclid=abc",
    );
    expect(result.canOpen).toBe(true);
    expect(result.removedParameters).toContain("utm_source");
    expect(new URL(result.cleanedUrl!).searchParams.get("id")).toBe("42");
    expect(new URL(result.cleanedUrl!).searchParams.has("utm_source")).toBe(false);
  });
  it.each(["javascript:alert(1)", "data:text/html,hello", "file:///C:/test", "not a url"])(
    "非Web URLを承認できない: %s",
    (url) => {
      expect(analyzeExternalLink(url).canOpen).toBe(false);
    },
  );
  it("HTTPと認証情報を警告する", () => {
    const result = analyzeExternalLink("http://user:password@example.com/path");
    expect(result.hostname).toBe("example.com");
    expect(result.warnings).toHaveLength(2);
  });
  it("一致がなくても安全という判定は作らない", () => {
    const result = analyzeExternalLink("https://example.com/article?id=42");
    expect(result.cleanedUrl).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.original).toBe("https://example.com/article?id=42");
  });
});

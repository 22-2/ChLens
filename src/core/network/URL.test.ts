import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/storage/Cache.js", () => ({ default: class Cache {} }));
vi.mock("src/core/network/HTTP", () => ({ Request: class Request {} }));

import { fix, setProtocol } from "src/core/network/URL";

describe("URL互換ヘルパー", () => {
  it("既存の保存・遷移URLからフラグメントを除く", () => {
    const input = "https://example.com/test/read.cgi/board/123/#res-4";

    // 旧URLクラスは構築時にhashを除去していたため、DBキー互換を維持する。
    expect(fix(input)).toBe("https://example.com/test/read.cgi/board/123/");
    expect(setProtocol(input, "http:")).toBe("http://example.com/test/read.cgi/board/123/");
  });
});

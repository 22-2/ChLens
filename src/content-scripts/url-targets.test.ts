// @vitest-environment node
import {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "src/content-scripts/url-targets";
import { describe, expect, it, vi } from "vite-plus/test";

// 実在するスレッドを使わず、通信方式と保存キーの違いを検証する。
vi.mock("packages/chlib/src/url/hosts", async (importOriginal) => {
  const hosts = await importOriginal<typeof import("packages/chlib/src/url/hosts")>();
  return { ...hosts, HOSTNAME: { ...hosts.HOSTNAME, EDDIBB: "edge.example.com" } };
});

describe("content script url targets", () => {
  it("5ch の read.cgi スレッドURLを対象と判定する", () => {
    expect(isTargetContentScriptUrl("https://egg.5ch.io/test/read.cgi/software/1000000004/")).toBe(
      true,
    );
  });

  it("したらば storage 形式URLを対象と判定する", () => {
    expect(
      isTargetContentScriptUrl("https://jbbs.shitaraba.net/computer/12345/storage/1000000005.html"),
    ).toBe(true);
  });

  it("itestの過去ログURLをレス番号付きでも対象と判定する", () => {
    expect(
      isTargetContentScriptUrl(
        "https://itest.5ch.net/kako/test/read.cgi/exampleboard/1000000008/20",
      ),
    ).toBe(true);
  });

  it("machi 板 index URLを対象と判定する", () => {
    expect(isTargetContentScriptUrl("https://kanto.machi.to/kana/index.html")).toBe(true);
  });

  it("非対応URLを除外する", () => {
    expect(isTargetContentScriptUrl("https://example.com/path/to/page")).toBe(false);
  });

  it("eddibb の素URLを read.cgi 形式へ正規化する", () => {
    expect(normalizeContentScriptTargetUrl("https://edge.example.com/liveedge/1000000006/")).toBe(
      "https://edge.example.com/test/read.cgi/liveedge/1000000006/",
    );
  });
});

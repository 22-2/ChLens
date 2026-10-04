import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cookieApi = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("webextension-polyfill", () => ({
  default: { cookies: cookieApi },
}));

vi.mock("packages/ch-lib/src/url/hosts", async (importOriginal) => {
  const original = await importOriginal<typeof import("packages/ch-lib/src/url/hosts")>();
  // 実在の掲示板へ依存せず、エッヂ固有の投稿経路を予約済みドメインで検証する。
  return {
    ...original,
    HOSTNAME: { ...original.HOSTNAME, EDDIBB: "edge.example.com" },
    classifyBoardHost: (hostname: string) =>
      hostname === "edge.example.com" ? "eddibb" : original.classifyBoardHost(hostname),
  };
});

import { resolveBoardUrl } from "packages/ch-lib/src/url/resolveBoardUrl";
import { getWriteFormData } from "packages/ch-lib/src/url/write";

import { BrowserHttpClient } from "./HttpClient";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("拡張機能版の書き込み認証", () => {
  beforeEach(() => {
    cookieApi.set.mockReset();
    // 認証Cookieの手動設定を復活させず、ブラウザ標準の送信に委ねることを確認する。
    cookieApi.set.mockRejectedValue(new Error("認証Cookieを手動設定しないでください"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it.each(["http:", "https:"])(
    "%s の通信方式とメール欄のトークンを投稿まで維持する",
    async (protocol) => {
      const form = getWriteFormData(
        `${protocol}//edge.example.com/test/read.cgi/sample-board/123/`,
        {
          name: "",
          mail: `#${TOKEN}`,
          message: "本文",
        },
      );
      expect(form?.action).toBe(`${protocol}//edge.example.com/test/bbs.cgi`);
      expect(form?.referer).toBe(`${protocol}//edge.example.com/sample-board/`);
      expect(form?.input.mail).toBe(`#${TOKEN}`);

      await BrowserHttpClient.setupWriteHeaders(form!.action);
      expect(cookieApi.set).not.toHaveBeenCalled();
    },
  );

  it("別の掲示板のHTTP投稿先は維持する", () => {
    expect(
      getWriteFormData("http://other.example.com/test/read.cgi/sample-board/123/", {
        name: "",
        mail: "sage",
        message: "本文",
      })?.action,
    ).toBe("http://other.example.com/test/bbs.cgi");
  });

  it.each(["http:", "https:"])("短縮URLの%sを内部遷移から投稿まで維持する", (protocol) => {
    const page = resolveBoardUrl(`${protocol}//edge.example.com/sample-board/123/`, {
      mode: "strict",
    });
    expect(page?.type).toBe("thread");
    const form = getWriteFormData(page!.url, { name: "", mail: `#${TOKEN}`, message: "本文" });
    expect(form?.action).toBe(`${protocol}//edge.example.com/test/bbs.cgi`);
  });
});

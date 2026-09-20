import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cookieApi = vi.hoisted(() => ({
  getAll: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: { cookies: cookieApi },
}));

import { BrowserCookieManager } from "./CookieManager";

function createCookie(overrides: Record<string, unknown> = {}) {
  return {
    name: "session",
    domain: "example.com",
    path: "/",
    secure: false,
    storeId: "0",
    firstPartyDomain: "",
    ...overrides,
  };
}

describe("ブラウザ版サイトCookie管理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieApi.getAll.mockResolvedValue([]);
    cookieApi.remove.mockResolvedValue({});
  });

  it("サイトに送られるCookieをパスとSecure属性ごとに削除する", async () => {
    cookieApi.getAll.mockImplementation(async (details: { domain?: string; url?: string }) => {
      if (details.domain) {
        return [
          createCookie({ name: "parent", path: "/board", secure: false }),
          createCookie({ name: "subdomain", domain: "bbs.example.com" }),
        ];
      }
      if (details.url?.startsWith("https:")) {
        return [createCookie({ name: "secure", path: "/secure", secure: true })];
      }
      return [createCookie({ name: "plain", path: "/plain", secure: false })];
    });

    await BrowserCookieManager.clearSiteCookies("Example.com");

    expect(cookieApi.getAll).toHaveBeenCalledTimes(3);
    expect(cookieApi.remove).toHaveBeenCalledTimes(3);
    expect(cookieApi.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "secure",
        url: "https://example.com/secure",
      }),
    );
    expect(cookieApi.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "plain",
        url: "http://example.com/plain",
      }),
    );
    expect(cookieApi.remove).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "subdomain" }),
    );
  });

  it("サイトCookieの存在を確認できる", async () => {
    cookieApi.getAll.mockResolvedValue([createCookie()]);

    await expect(BrowserCookieManager.hasSiteCookies("example.com")).resolves.toBe(true);
  });

  it("Cookieがないサイトは存在しないと判定する", async () => {
    await expect(BrowserCookieManager.hasSiteCookies("example.com")).resolves.toBe(false);
  });

  it("サイト名にパスやクエリを含めた削除を拒否する", async () => {
    await expect(BrowserCookieManager.clearSiteCookies("example.com/board")).rejects.toThrow(
      "Cookieを削除するサイトの指定が不正です",
    );
    expect(cookieApi.getAll).not.toHaveBeenCalled();
  });
});

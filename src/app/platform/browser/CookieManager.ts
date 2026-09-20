import type { CookieManager } from "src/app/platform/types";
import browser from "webextension-polyfill";

function normalizeSiteHost(site: string): string {
  const parsed = new URL(site.includes("://") ? site : `https://${site}`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Cookieを削除するサイトの指定が不正です");
  }
  return parsed.hostname.toLowerCase();
}

function createCookieLookupUrls(site: string): string[] {
  return [`https://${site}/`, `http://${site}/`];
}

function createCookieRemovalUrl(site: string, secure: boolean, path: string): string {
  const protocol = secure ? "https:" : "http:";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${protocol}//${site}/`).toString();
}

function cookieDomainMatchesSite(cookieDomain: string, site: string): boolean {
  const domain = cookieDomain.replace(/^\.+/u, "").toLowerCase();
  return domain === site || site.endsWith(`.${domain}`);
}

/** ブラウザ拡張機能のサイトCookieを、Cookieのパス違いも含めて削除する。 */
export const BrowserCookieManager: CookieManager = {
  async clearSiteCookies(site: string): Promise<void> {
    const siteHost = normalizeSiteHost(site);
    const cookies = new Map<string, browser.Cookies.Cookie>();

    // 変更理由: Secure属性の有無でCookie APIのURLフィルター結果が分かれるため、
    // HTTP/HTTPSの両方を検索し、同名でもパスやストアが異なるCookieを取りこぼさない。
    const lookupDetails = [
      { domain: siteHost },
      ...createCookieLookupUrls(siteHost).map((url) => ({ url })),
    ];
    for (const details of lookupDetails) {
      const matches = await browser.cookies.getAll(details);
      for (const cookie of matches) {
        if (!cookieDomainMatchesSite(cookie.domain, siteHost)) {
          continue;
        }
        const key = [
          cookie.storeId,
          cookie.domain,
          cookie.path,
          cookie.name,
          cookie.firstPartyDomain,
          cookie.partitionKey?.topLevelSite ?? "",
          cookie.partitionKey?.hasCrossSiteAncestor === true ? "1" : "0",
        ].join("\u0000");
        cookies.set(key, cookie);
      }
    }

    await Promise.all(
      Array.from(cookies.values()).map(async (cookie) => {
        const details = {
          url: createCookieRemovalUrl(siteHost, cookie.secure, cookie.path),
          name: cookie.name,
          storeId: cookie.storeId,
          ...(cookie.firstPartyDomain ? { firstPartyDomain: cookie.firstPartyDomain } : {}),
          ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
        };
        const removed = await browser.cookies.remove(details);
        if (removed === null) {
          throw new Error(`Cookieの削除に失敗しました: ${cookie.name}`);
        }
      }),
    );
  },
};

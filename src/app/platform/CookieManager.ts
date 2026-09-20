import { isTauriRuntime } from "src/app/platform/runtime";
import type { CookieManager } from "src/app/platform/types";

/** 実行環境ごとのCookie APIを遅延読み込みし、設定画面のテストで拡張APIを要求しない。 */
export const platformCookieManager: CookieManager = {
  async hasSiteCookies(site: string): Promise<boolean> {
    if (isTauriRuntime()) {
      const { TauriCookieManager } = await import("src/app/platform/tauri/CookieManager");
      return await TauriCookieManager.hasSiteCookies(site);
    }

    const { BrowserCookieManager } = await import("src/app/platform/browser/CookieManager");
    return await BrowserCookieManager.hasSiteCookies(site);
  },

  async clearSiteCookies(site: string): Promise<void> {
    if (isTauriRuntime()) {
      const { TauriCookieManager } = await import("src/app/platform/tauri/CookieManager");
      await TauriCookieManager.clearSiteCookies(site);
      return;
    }

    const { BrowserCookieManager } = await import("src/app/platform/browser/CookieManager");
    await BrowserCookieManager.clearSiteCookies(site);
  },
};

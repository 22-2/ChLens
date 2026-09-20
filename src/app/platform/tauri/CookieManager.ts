import type { CookieManager } from "src/app/platform/types";

/** Tauri版では書き込み確認用のRust Cookie Jarだけを対象にする。 */
export const TauriCookieManager: CookieManager = {
  async clearSiteCookies(site: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_write_cookies", { site });
  },
};

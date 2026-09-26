import type { CookieManager } from "src/app/platform/types";

/** Tauri版では書き込み確認用のRust Cookie Jarだけを対象にする。 */
export const TauriCookieManager: CookieManager = {
  async hasAnyCookies(): Promise<boolean> {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("has_any_write_cookies");
  },

  async hasSiteCookies(site: string): Promise<boolean> {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("has_write_cookies", { site });
  },

  async clearAllCookies(): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_all_write_cookies");
  },

  async clearSiteCookies(site: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_write_cookies", { site });
  },
};

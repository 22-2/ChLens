import { isTauriRuntime } from "src/app/platform/runtime";
import type { DownloadManager } from "src/app/platform/types";

/**
 * 実行環境に応じたダウンロード実装を遅延選択する。
 *
 * このファイル自身からブラウザ拡張機能のAPIを読み込まないことで、
 * メディアビューアーのユニットテストやTauriのWebViewでも不要な初期化を避ける。
 */
export const platformDownloadManager: DownloadManager = {
  async save(url: string, fileName: string): Promise<void> {
    if (isTauriRuntime()) {
      const { TauriDownloadManager } = await import("src/app/platform/tauri/DownloadManager");
      await TauriDownloadManager.save(url, fileName);
      return;
    }

    const { BrowserDownloadManager } = await import("src/app/platform/browser/DownloadManager");
    await BrowserDownloadManager.save(url, fileName);
  },
};

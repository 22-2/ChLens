import { fetchTauriBinary } from "src/app/platform/tauri/HttpClient";
import type { DownloadManager } from "src/app/platform/types";

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Tauri環境用のダウンロード実装。
 *
 * WebViewのfetchとdownload属性は外部画像のCORSや保存先の制約を受けるため、
 * 取得はTauriのHTTP経由、保存はRust側のダウンロードフォルダー処理へ分離する。
 */
export const TauriDownloadManager: DownloadManager = {
  async save(url: string, fileName: string): Promise<void> {
    const response = await fetchTauriBinary(url, {
      headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
      timeout: DOWNLOAD_TIMEOUT_MS,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`画像の取得に失敗しました: HTTP ${response.status}`);
    }

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_download_file", {
      fileName,
      body: Array.from(new Uint8Array(response.body)),
    });
  },
};

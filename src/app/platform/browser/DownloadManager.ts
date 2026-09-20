import type { DownloadManager } from "src/app/platform/types";

/**
 * ブラウザ拡張機能環境用のダウンロード実装。
 *
 * 拡張機能では、同一オリジンのblob URLをdownload属性へ渡すことで、
 * ブラウザ本体の既定のダウンロード先へ保存させる。
 */
export const BrowserDownloadManager: DownloadManager = {
  async save(url: string, fileName: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`画像の取得に失敗しました: HTTP ${response.status}`);
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  },
};

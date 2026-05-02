import { WindowManager, WindowOptions } from "src/app/platform/types";

// Tauri環境ではbrowser.tabs/windowsが使えないため、
// window.openを使ってシステムブラウザまたは新しいwebviewウィンドウを開く
export const TauriWindowManager: WindowManager = {
  getAssetUrl(path: string): string {
    return new URL(path, window.location.href).toString();
  },

  async openTab(url: string, _active = true): Promise<void> {
    window.open(url, "_blank");
  },

  async openWindow(options: WindowOptions): Promise<void> {
    const features = [
      options.width ? `width=${options.width}` : "",
      options.height ? `height=${options.height}` : "",
    ]
      .filter(Boolean)
      .join(",");
    window.open(options.url, "_blank", features);
  },

  async closeCurrent(): Promise<void> {
    window.close();
  },
};

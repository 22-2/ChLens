import { WindowManager, WindowOptions } from "src/app/platform/types";

/**
 * ブラウザ拡張機能環境用のWindowManager実装
 */
export const BrowserWindowManager: WindowManager = {
  async openTab(url: string, active = true): Promise<void> {
    await browser.tabs.create({ url, active });
  },

  async openWindow(options: WindowOptions): Promise<void> {
    if (typeof browser !== "undefined" && browser.windows) {
      await browser.windows.create({
        url: options.url,
        width: options.width,
        height: options.height,
        focused: options.focused ?? true,
        type: "popup",
      });
    } else {
      const features = [
        options.width ? `width=${options.width}` : "",
        options.height ? `height=${options.height}` : "",
      ]
        .filter(Boolean)
        .join(",");
      window.open(options.url, "_blank", features);
    }
  },

  async closeCurrent(): Promise<void> {
    const current = await browser.tabs.getCurrent();
    if (current?.id) {
      await browser.tabs.remove(current.id);
    }
  },
};

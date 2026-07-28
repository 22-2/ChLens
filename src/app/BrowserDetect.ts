import browser from "webextension-polyfill";

/**
 * ブラウザ種別を実行時に検出するユーティリティ
 */

let cachedBrowser: "chrome" | "firefox" | null = null;

export async function detectBrowser(): Promise<"chrome" | "firefox"> {
  if (cachedBrowser) {
    return cachedBrowser;
  }

  try {
    // Firefox: browser.runtime.getBrowserInfo()が利用可能
    if (typeof browser !== "undefined" && browser.runtime?.getBrowserInfo) {
      const info = await browser.runtime.getBrowserInfo();
      cachedBrowser = info.name === "Firefox" ? "firefox" : "chrome";
      return cachedBrowser;
    }
  } catch {
    // Chrome or other browsers
  }

  // Chrome or Chromium-based browsers
  cachedBrowser = "chrome";
  return cachedBrowser;
}

export function getBrowserSync(): "chrome" | "firefox" {
  if (cachedBrowser) {
    return cachedBrowser;
  }

  // Synchronous detection (less reliable but works for most cases)
  try {
    if (typeof browser !== "undefined" && navigator.userAgent.includes("Firefox")) {
      cachedBrowser = "firefox";
      return cachedBrowser;
    }
  } catch {
    // ignore
  }

  cachedBrowser = "chrome";
  return cachedBrowser;
}

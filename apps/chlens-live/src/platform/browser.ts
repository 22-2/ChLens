import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { LiveWindowPlatform, OverlayGeometry, OverlayResizeDirection } from "./types";

/**
 * フロントエンド試作と単体テストで使うブラウザ用フォールバック。
 * Tauriアダプターが有効になるまでは、実ウィンドウ操作を意図的に何もしない。
 */
export function createBrowserLiveWindowPlatform(): LiveWindowPlatform {
  let geometry = fallbackOverlayGeometry(loadStoredOverlayGeometry());

  return {
    // ブラウザ用フォールバックは2つ目のネイティブウィンドウを操作できないため、
    // Tauri実装と同じ非同期契約を保ちながら何もしない。
    async showOverlay() {},
    async hideOverlay() {},
    async focusOverlay() {},
    async startResizingOverlay(_direction: OverlayResizeDirection) {},
    async minimizeOverlay() {},
    async toggleMaximizeOverlay() {},
    async closeOverlay() {},
    async setOverlayClickThrough(_enabled: boolean) {},
    trackOverlayBarHover(_listener: (hovered: boolean) => void) {
      // ブラウザのプレビューには透明なネイティブウィンドウがないため、
      // 2つ目のカーソル監視ループを開始せずCSSのhoverをフォールバックにする。
      return () => {};
    },
    async getOverlayGeometry() {
      return cloneOverlayGeometry(geometry);
    },
    async watchOverlayGeometry(_listener: (nextGeometry: OverlayGeometry) => void) {
      return () => {};
    },
    async setOverlayGeometry(nextGeometry: OverlayGeometry) {
      geometry = fallbackOverlayGeometry(nextGeometry);
    },
    async loadOverlayGeometry() {
      const stored = loadStoredOverlayGeometry();
      if (stored) geometry = stored;
      return stored ? cloneOverlayGeometry(stored) : null;
    },
    async saveOverlayGeometry(nextGeometry: OverlayGeometry) {
      geometry = fallbackOverlayGeometry(nextGeometry);
      saveStoredOverlayGeometry(geometry);
    },
  };
}

import {
  cloneOverlayGeometry,
  fitOverlayGeometryToAspectRatio,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { CommentOverlayMonitor } from "src/features/comment-overlay/platform";
import type { LiveWindowPlatform, OverlayGeometry } from "./types";

const STORYBOOK_MONITORS: readonly CommentOverlayMonitor[] = [
  {
    id: "storybook-monitor",
    name: "Storybookモニター",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1,
  },
];

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
    async minimizeOverlay() {},
    async toggleMaximizeOverlay() {},
    async closeOverlay() {},
    async getOverlayMonitors() {
      return STORYBOOK_MONITORS;
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
      if (!stored) return null;
      geometry = fitOverlayGeometryToAspectRatio(stored);
      saveStoredOverlayGeometry(geometry);
      return cloneOverlayGeometry(geometry);
    },
    async saveOverlayGeometry(nextGeometry: OverlayGeometry) {
      geometry = fitOverlayGeometryToAspectRatio(nextGeometry);
      saveStoredOverlayGeometry(geometry);
    },
  };
}

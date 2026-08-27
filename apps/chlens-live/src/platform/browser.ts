import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { LiveWindowPlatform, OverlayGeometry, OverlayResizeDirection } from "./types";

/**
 * Browser fallback used by the frontend spike and unit tests.
 * The real window operations are intentionally no-ops until the Tauri adapter is active.
 */
export function createBrowserLiveWindowPlatform(): LiveWindowPlatform {
  let geometry = fallbackOverlayGeometry(loadStoredOverlayGeometry());

  return {
    // The browser fallback cannot control a second native window, so these operations remain
    // no-ops while keeping the same async contract as the Tauri implementation.
    async showOverlay() {},
    async hideOverlay() {},
    async focusOverlay() {},
    async startResizingOverlay(_direction: OverlayResizeDirection) {},
    async minimizeOverlay() {},
    async toggleMaximizeOverlay() {},
    async closeOverlay() {},
    async setOverlayClickThrough(_enabled: boolean) {},
    trackOverlayBarHover(_listener: (hovered: boolean) => void) {
      // Browser previews do not have a native transparent window, so CSS hover remains the
      // appropriate fallback instead of starting a second cursor polling loop.
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

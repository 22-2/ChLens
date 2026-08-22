import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { LiveWindowPlatform, OverlayGeometry } from "./types";

const OVERLAY_WINDOW_LABEL = "overlay";

async function getOverlayWindow(): Promise<WebviewWindow> {
  const overlay = await WebviewWindow.getByLabel(OVERLAY_WINDOW_LABEL);
  if (!overlay) {
    throw new Error(`Tauri window '${OVERLAY_WINDOW_LABEL}' is not available`);
  }
  return overlay;
}

export function createTauriLiveWindowPlatform(): LiveWindowPlatform {
  const platform: LiveWindowPlatform = {
    async showOverlay() {
      await (await getOverlayWindow()).show();
    },
    async hideOverlay() {
      await (await getOverlayWindow()).hide();
    },
    async focusOverlay() {
      const overlay = await getOverlayWindow();
      await overlay.show();
      await overlay.setFocus();
    },
    async getOverlayGeometry() {
      const overlay = await getOverlayWindow();
      const [position, size, scaleFactor] = await Promise.all([
        overlay.outerPosition(),
        overlay.outerSize(),
        overlay.scaleFactor(),
      ]);
      // Tauri reports outer bounds in physical pixels; persist logical pixels so saved layouts
      // remain stable when Windows display scaling changes between sessions.
      const logicalPosition = position.toLogical(scaleFactor);
      const logicalSize = size.toLogical(scaleFactor);
      return {
        x: logicalPosition.x,
        y: logicalPosition.y,
        width: logicalSize.width,
        height: logicalSize.height,
      };
    },
    async setOverlayGeometry(geometry: OverlayGeometry) {
      const overlay = await getOverlayWindow();
      const normalized = fallbackOverlayGeometry(geometry);
      await overlay.setPosition(new LogicalPosition(normalized.x, normalized.y));
      await overlay.setSize(new LogicalSize(normalized.width, normalized.height));
    },
    async loadOverlayGeometry() {
      const stored = loadStoredOverlayGeometry();
      if (stored) {
        // Restore the native window at startup so the first displayed overlay uses the saved layout.
        await platform.setOverlayGeometry(stored);
      }
      return stored ? cloneOverlayGeometry(stored) : null;
    },
    async saveOverlayGeometry(geometry: OverlayGeometry) {
      saveStoredOverlayGeometry(geometry);
    },
  };

  return platform;
}

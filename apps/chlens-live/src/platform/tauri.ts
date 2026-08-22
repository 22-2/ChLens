import { LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { LiveWindowPlatform, OverlayGeometry, OverlayResizeDirection } from "./types";

const OVERLAY_WINDOW_LABEL = "overlay";

async function getOverlayWindow(): Promise<Window> {
  // Native window operations belong to Window; the overlay's webview content is not needed here.
  const overlay = await Window.getByLabel(OVERLAY_WINDOW_LABEL);
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
    async startDraggingOverlay() {
      // Decorations are disabled for the overlay, so dragging must be initiated explicitly.
      await (await getOverlayWindow()).startDragging();
    },
    async startResizingOverlay(direction: OverlayResizeDirection) {
      // Native resize hit-testing is unavailable without decorations; use Tauri's directional API.
      await (await getOverlayWindow()).startResizeDragging(direction);
    },
    async setOverlayClickThrough(enabled: boolean) {
      // Click-through is a native window setting; CSS pointer-events alone would still block other apps.
      await (await getOverlayWindow()).setIgnoreCursorEvents(enabled);
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

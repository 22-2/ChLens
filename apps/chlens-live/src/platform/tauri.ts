import { LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import {
  OVERLAY_CONTROL_BAR_HEIGHT,
  type LiveWindowPlatform,
  type OverlayGeometry,
  type OverlayResizeDirection,
} from "./types";

const OVERLAY_WINDOW_LABEL = "overlay";
const OVERLAY_CONTROLS_WINDOW_LABEL = "overlay-controls";

async function getOverlayWindow(): Promise<Window> {
  // Native window operations belong to Window; the overlay's webview content is not needed here.
  const overlay = await Window.getByLabel(OVERLAY_WINDOW_LABEL);
  if (!overlay) {
    throw new Error(`Tauri window '${OVERLAY_WINDOW_LABEL}' is not available`);
  }
  return overlay;
}

async function getOverlayControlsWindow(): Promise<Window> {
  const controls = await Window.getByLabel(OVERLAY_CONTROLS_WINDOW_LABEL);
  if (!controls) {
    throw new Error(`Tauri window '${OVERLAY_CONTROLS_WINDOW_LABEL}' is not available`);
  }
  return controls;
}

async function readOverlayGeometry(overlay: Window): Promise<OverlayGeometry> {
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
}

export function createTauriLiveWindowPlatform(): LiveWindowPlatform {
  let controlsSyncRegistration: Promise<void> | null = null;
  let syncingWindowPair = false;

  const syncControlsToOverlay = async (overlay: Window, controls: Window): Promise<void> => {
    if (syncingWindowPair) return;

    syncingWindowPair = true;
    try {
      const geometry = await readOverlayGeometry(overlay);
      const [controlPosition, controlSize, controlScaleFactor] = await Promise.all([
        controls.outerPosition(),
        controls.outerSize(),
        controls.scaleFactor(),
      ]);
      const logicalControlPosition = controlPosition.toLogical(controlScaleFactor);
      const logicalControlSize = controlSize.toLogical(controlScaleFactor);
      if (logicalControlPosition.x !== geometry.x || logicalControlPosition.y !== geometry.y) {
        await controls.setPosition(new LogicalPosition(geometry.x, geometry.y));
      }
      if (
        logicalControlSize.width !== geometry.width ||
        logicalControlSize.height !== OVERLAY_CONTROL_BAR_HEIGHT
      ) {
        await controls.setSize(new LogicalSize(geometry.width, OVERLAY_CONTROL_BAR_HEIGHT));
      }
    } finally {
      syncingWindowPair = false;
    }
  };

  const ensureControlsSync = async (): Promise<void> => {
    if (!controlsSyncRegistration) {
      controlsSyncRegistration = (async () => {
        const overlay = await getOverlayWindow();
        const controls = await getOverlayControlsWindow();

        await overlay.onMoved(() => {
          void syncControlsToOverlay(overlay, controls).catch((error: unknown) => {
            console.error("[Chlens Live] overlay control position sync failed:", error);
          });
        });
        await overlay.onResized(() => {
          void syncControlsToOverlay(overlay, controls).catch((error: unknown) => {
            console.error("[Chlens Live] overlay control size sync failed:", error);
          });
        });
        await controls.onMoved(({ payload }) => {
          if (syncingWindowPair) return;

          void (async () => {
            syncingWindowPair = true;
            try {
              const scaleFactor = await overlay.scaleFactor();
              // Dragging the independent controls window moves the transparent overlay with it.
              await overlay.setPosition(payload.toLogical(scaleFactor));
            } finally {
              syncingWindowPair = false;
            }
          })().catch((error: unknown) => {
            console.error("[Chlens Live] overlay drag synchronization failed:", error);
          });
        });

        await syncControlsToOverlay(overlay, controls);
      })().catch((error: unknown) => {
        controlsSyncRegistration = null;
        throw error;
      });
    }

    await controlsSyncRegistration;
  };

  const platform: LiveWindowPlatform = {
    async showOverlay() {
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await ensureControlsSync();
      await overlay.unminimize();
      await controls.unminimize();
      await overlay.show();
      await controls.show();
      await syncControlsToOverlay(overlay, controls);
    },
    async hideOverlay() {
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await controls.hide();
      await overlay.hide();
    },
    async focusOverlay() {
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await ensureControlsSync();
      await overlay.unminimize();
      await controls.unminimize();
      await overlay.show();
      await controls.show();
      await overlay.setFocus();
    },
    async startDraggingOverlay() {
      // The controls window stays interactive during click-through, so drag it and mirror its position.
      await (await getOverlayControlsWindow()).startDragging();
    },
    async startResizingOverlay(direction: OverlayResizeDirection) {
      // Native resize hit-testing is unavailable without decorations; use Tauri's directional API.
      await (await getOverlayWindow()).startResizeDragging(direction);
    },
    async minimizeOverlay() {
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await overlay.minimize();
      await controls.minimize();
    },
    async toggleMaximizeOverlay() {
      // The bar is a separate window, so the transparent Overlay is the window whose state changes.
      await (await getOverlayWindow()).toggleMaximize();
    },
    async closeOverlay() {
      // Hide instead of destroying the configured windows so Main can show the Overlay again later.
      await platform.hideOverlay();
    },
    async setOverlayClickThrough(enabled: boolean) {
      // Click-through is a native window setting; CSS pointer-events alone would still block other apps.
      await (await getOverlayWindow()).setIgnoreCursorEvents(enabled);
    },
    async getOverlayGeometry() {
      const overlay = await getOverlayWindow();
      return readOverlayGeometry(overlay);
    },
    async setOverlayGeometry(geometry: OverlayGeometry) {
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      const normalized = fallbackOverlayGeometry(geometry);
      await ensureControlsSync();
      syncingWindowPair = true;
      try {
        await overlay.setPosition(new LogicalPosition(normalized.x, normalized.y));
        await overlay.setSize(new LogicalSize(normalized.width, normalized.height));
        await controls.setPosition(new LogicalPosition(normalized.x, normalized.y));
        await controls.setSize(new LogicalSize(normalized.width, OVERLAY_CONTROL_BAR_HEIGHT));
      } finally {
        syncingWindowPair = false;
      }
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

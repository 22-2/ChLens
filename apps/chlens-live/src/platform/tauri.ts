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
const GEOMETRY_EPSILON = 0.5;

type LogicalWindowPosition = { x: number; y: number };

function geometryDiffers(left: number, right: number): boolean {
  // Native window APIs can round physical pixels differently per monitor, so exact float
  // comparisons would keep scheduling no-op synchronization passes at fractional DPI values.
  return Math.abs(left - right) > GEOMETRY_EPSILON;
}

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

async function readLogicalWindowPosition(window: Window): Promise<LogicalWindowPosition> {
  const [position, scaleFactor] = await Promise.all([window.outerPosition(), window.scaleFactor()]);
  const logicalPosition = position.toLogical(scaleFactor);
  return { x: logicalPosition.x, y: logicalPosition.y };
}

export function createTauriLiveWindowPlatform(): LiveWindowPlatform {
  let controlsSyncRegistration: Promise<void> | null = null;
  let syncingWindowPair = false;
  let controlsSyncRequested = false;
  let controlsSyncPromise: Promise<void> | null = null;
  let overlayPositionSyncRequested = false;
  let overlayPositionSyncPromise: Promise<void> | null = null;

  const syncControlsToOverlay = async (overlay: Window, controls: Window): Promise<void> => {
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
      if (
        geometryDiffers(logicalControlPosition.x, geometry.x) ||
        geometryDiffers(logicalControlPosition.y, geometry.y)
      ) {
        await controls.setPosition(new LogicalPosition(geometry.x, geometry.y));
      }
      if (
        geometryDiffers(logicalControlSize.width, geometry.width) ||
        geometryDiffers(logicalControlSize.height, OVERLAY_CONTROL_BAR_HEIGHT)
      ) {
        await controls.setSize(new LogicalSize(geometry.width, OVERLAY_CONTROL_BAR_HEIGHT));
      }
    } finally {
      syncingWindowPair = false;
    }
  };

  const requestControlsSync = (overlay: Window, controls: Window): Promise<void> => {
    controlsSyncRequested = true;
    if (!controlsSyncPromise) {
      controlsSyncPromise = (async () => {
        while (controlsSyncRequested) {
          controlsSyncRequested = false;
          if (syncingWindowPair) {
            // Serialize the two directions so an overlay move cannot race a controls correction
            // and leave the pair at an intermediate position.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            controlsSyncRequested = true;
            continue;
          }
          await syncControlsToOverlay(overlay, controls);
        }
      })().finally(() => {
        controlsSyncPromise = null;
      });
    }
    return controlsSyncPromise;
  };

  const syncOverlayPositionToControls = async (
    overlay: Window,
    controls: Window,
  ): Promise<void> => {
    const [overlayPosition, controlsPosition] = await Promise.all([
      readLogicalWindowPosition(overlay),
      readLogicalWindowPosition(controls),
    ]);
    if (
      !geometryDiffers(overlayPosition.x, controlsPosition.x) &&
      !geometryDiffers(overlayPosition.y, controlsPosition.y)
    ) {
      return;
    }

    syncingWindowPair = true;
    try {
      // Read the controls window in its own scale space before mirroring it to Overlay. This
      // avoids a position jump when the two windows cross monitors with different DPI settings.
      await overlay.setPosition(new LogicalPosition(controlsPosition.x, controlsPosition.y));
    } finally {
      syncingWindowPair = false;
    }
  };

  const requestOverlayPositionSync = (overlay: Window, controls: Window): Promise<void> => {
    overlayPositionSyncRequested = true;
    if (!overlayPositionSyncPromise) {
      overlayPositionSyncPromise = (async () => {
        while (overlayPositionSyncRequested) {
          overlayPositionSyncRequested = false;
          if (syncingWindowPair) {
            // A native move can arrive while the resize sync is in flight. Keep the request alive
            // for the next turn instead of dropping the final pointer position.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            overlayPositionSyncRequested = true;
            continue;
          }
          await syncOverlayPositionToControls(overlay, controls);
        }
      })().finally(() => {
        overlayPositionSyncPromise = null;
      });
    }
    return overlayPositionSyncPromise;
  };

  const ensureControlsSync = async (): Promise<void> => {
    if (!controlsSyncRegistration) {
      controlsSyncRegistration = (async () => {
        const overlay = await getOverlayWindow();
        const controls = await getOverlayControlsWindow();

        await overlay.onMoved(() => {
          void requestControlsSync(overlay, controls).catch((error: unknown) => {
            console.error("[Chlens Live] overlay control position sync failed:", error);
          });
        });
        await overlay.onResized(() => {
          void requestControlsSync(overlay, controls).catch((error: unknown) => {
            console.error("[Chlens Live] overlay control size sync failed:", error);
          });
        });
        await controls.onMoved(() => {
          void requestOverlayPositionSync(overlay, controls).catch((error: unknown) => {
            console.error("[Chlens Live] overlay drag synchronization failed:", error);
          });
        });

        await requestControlsSync(overlay, controls);
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
      await requestControlsSync(overlay, controls);
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
      await requestControlsSync(overlay, controls);
      await overlay.setFocus();
    },
    async startDraggingOverlay() {
      // The controls window stays interactive during click-through, so drag it and mirror its position.
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await ensureControlsSync();
      // A click on the bar is also a chance to repair a stale width/position before the drag makes
      // the controls window the new source of truth.
      await requestControlsSync(overlay, controls);
      await controls.startDragging();
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
      const overlay = await getOverlayWindow();
      const controls = await getOverlayControlsWindow();
      await overlay.toggleMaximize();
      await requestControlsSync(overlay, controls);
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
      } finally {
        syncingWindowPair = false;
      }
      await requestControlsSync(overlay, controls);
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

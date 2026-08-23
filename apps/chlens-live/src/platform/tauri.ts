import { invoke } from "@tauri-apps/api/core";
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
const CURSOR_POLL_INTERVAL_MS = 50;
const CURSOR_REENABLE_DELAY_MS = 80;
const INTERACTIVE_EDGE_SIZE = 14;
const CONTROL_BAR_TOP_INSET = 4;
const CONTROL_BAR_HORIZONTAL_INSET = 4;

interface CursorPosition {
  x: number;
  y: number;
}

type CursorHitRegion = "outside" | "bar" | "resize";

interface PhysicalWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

async function getOverlayWindow(): Promise<Window> {
  // Native window operations belong to Window; the overlay's webview content is not needed here.
  const overlay = await Window.getByLabel(OVERLAY_WINDOW_LABEL);
  if (!overlay) {
    throw new Error(`Tauri window '${OVERLAY_WINDOW_LABEL}' is not available`);
  }
  return overlay;
}

async function readPhysicalWindowBounds(window: Window): Promise<PhysicalWindowBounds> {
  const [position, size, scaleFactor] = await Promise.all([
    window.outerPosition(),
    window.outerSize(),
    window.scaleFactor(),
  ]);
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    scaleFactor,
  };
}

async function readOverlayGeometry(overlay: Window): Promise<OverlayGeometry> {
  const bounds = await readPhysicalWindowBounds(overlay);
  // Tauri reports outer bounds in physical pixels; persist logical pixels so saved layouts
  // remain stable when Windows display scaling changes between sessions.
  return {
    x: bounds.x / bounds.scaleFactor,
    y: bounds.y / bounds.scaleFactor,
    width: bounds.width / bounds.scaleFactor,
    height: bounds.height / bounds.scaleFactor,
  };
}

function getCursorHitRegion(cursor: CursorPosition, bounds: PhysicalWindowBounds): CursorHitRegion {
  const insideWindow =
    cursor.x >= bounds.x &&
    cursor.x <= bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y <= bounds.y + bounds.height;
  if (!insideWindow) return "outside";

  // The top bar and the resize border are the only areas that should temporarily receive input.
  // Keeping this hit test native lets the rest of the transparent window stay click-through.
  const edgeSize = INTERACTIVE_EDGE_SIZE * bounds.scaleFactor;
  const barHeight = (CONTROL_BAR_TOP_INSET + OVERLAY_CONTROL_BAR_HEIGHT) * bounds.scaleFactor;
  const barLeft = bounds.x + CONTROL_BAR_HORIZONTAL_INSET * bounds.scaleFactor;
  const barRight = bounds.x + bounds.width - CONTROL_BAR_HORIZONTAL_INSET * bounds.scaleFactor;
  const insideBar = cursor.x >= barLeft && cursor.x <= barRight && cursor.y <= bounds.y + barHeight;
  if (insideBar) return "bar";

  return cursor.x <= bounds.x + edgeSize ||
    cursor.x >= bounds.x + bounds.width - edgeSize ||
    cursor.y >= bounds.y + bounds.height - edgeSize
    ? "resize"
    : "outside";
}

export function createTauriLiveWindowPlatform(): LiveWindowPlatform {
  let clickThroughRequested = false;
  let cursorPollTimer: ReturnType<typeof setInterval> | null = null;
  let cursorReenableTimer: ReturnType<typeof setTimeout> | null = null;
  let cursorPollInFlight = false;
  let nativeCursorEventsIgnored: boolean | null = null;
  let nativeCursorMutation: Promise<void> = Promise.resolve();
  let cursorPollingStartPromise: Promise<void> | null = null;
  const overlayBarHoverListeners = new Set<(hovered: boolean) => void>();
  let lastOverlayBarHovered: boolean | null = null;

  const notifyOverlayBarHover = (hovered: boolean): void => {
    if (lastOverlayBarHovered === hovered) return;
    lastOverlayBarHovered = hovered;
    for (const listener of overlayBarHoverListeners) {
      try {
        listener(hovered);
      } catch (error: unknown) {
        console.error("[Chlens Live] overlay bar hover listener failed:", error);
      }
    }
  };

  const setNativeCursorEventsIgnored = async (overlay: Window, ignored: boolean): Promise<void> => {
    nativeCursorMutation = nativeCursorMutation
      .catch(() => undefined)
      .then(async () => {
        if (nativeCursorEventsIgnored === ignored) return;

        // Serialize native hit-test changes because Windows can fail when setIgnoreCursorEvents is
        // called again while the previous WebView style transition is still being applied.
        await overlay.setIgnoreCursorEvents(ignored);
        nativeCursorEventsIgnored = ignored;
      });
    await nativeCursorMutation;
  };

  const updateCursorHitTest = async (overlay: Window): Promise<void> => {
    if ((!clickThroughRequested && overlayBarHoverListeners.size === 0) || cursorPollInFlight) {
      return;
    }

    cursorPollInFlight = true;
    try {
      const [cursor, bounds] = await Promise.all([
        invoke<CursorPosition>("get_cursor_position"),
        readPhysicalWindowBounds(overlay),
      ]);
      const hitRegion = getCursorHitRegion(cursor, bounds);
      notifyOverlayBarHover(hitRegion === "bar");

      if (!clickThroughRequested) return;

      if (hitRegion !== "outside") {
        if (cursorReenableTimer) {
          clearTimeout(cursorReenableTimer);
          cursorReenableTimer = null;
        }
        await setNativeCursorEventsIgnored(overlay, false);
      } else if (
        clickThroughRequested &&
        nativeCursorEventsIgnored === false &&
        !cursorReenableTimer
      ) {
        // A short delay prevents rapid native hit-test toggles while the pointer leaves a button.
        // WindowPet uses the same guard because toggling this Windows setting too quickly can crash.
        cursorReenableTimer = setTimeout(() => {
          cursorReenableTimer = null;
          if (!clickThroughRequested) return;
          void setNativeCursorEventsIgnored(overlay, true).catch((error: unknown) => {
            console.error("[Chlens Live] cursor passthrough re-enable failed:", error);
          });
        }, CURSOR_REENABLE_DELAY_MS);
      }
    } catch (error: unknown) {
      console.error("[Chlens Live] native cursor hit-test failed:", error);
    } finally {
      cursorPollInFlight = false;
    }
  };

  const startCursorPolling = async (overlay: Window): Promise<void> => {
    if (cursorPollTimer) return;
    if (!cursorPollingStartPromise) {
      cursorPollingStartPromise = (async () => {
        cursorPollTimer = setInterval(() => {
          void updateCursorHitTest(overlay);
        }, CURSOR_POLL_INTERVAL_MS);
        await updateCursorHitTest(overlay);
      })().finally(() => {
        cursorPollingStartPromise = null;
      });
    }
    await cursorPollingStartPromise;
  };

  const stopCursorPolling = async (overlay: Window, keepRequest: boolean): Promise<void> => {
    if (!clickThroughRequested && overlayBarHoverListeners.size === 0 && cursorPollTimer) {
      clearInterval(cursorPollTimer);
      cursorPollTimer = null;
      lastOverlayBarHovered = null;
    }
    if (cursorReenableTimer) {
      clearTimeout(cursorReenableTimer);
      cursorReenableTimer = null;
    }

    if (!keepRequest) clickThroughRequested = false;
    await setNativeCursorEventsIgnored(overlay, keepRequest);
  };

  const platform: LiveWindowPlatform = {
    async showOverlay() {
      const overlay = await getOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      if (clickThroughRequested) await startCursorPolling(overlay);
    },
    async hideOverlay() {
      const overlay = await getOverlayWindow();
      // Keep the user's requested mode so showing the overlay again restores the same behavior.
      await stopCursorPolling(overlay, clickThroughRequested);
      await overlay.hide();
    },
    async focusOverlay() {
      const overlay = await getOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      if (clickThroughRequested) await startCursorPolling(overlay);
      await overlay.setFocus();
    },
    async startResizingOverlay(direction: OverlayResizeDirection) {
      // Native resize hit-testing is unavailable without decorations; use Tauri's directional API.
      await (await getOverlayWindow()).startResizeDragging(direction);
    },
    async minimizeOverlay() {
      const overlay = await getOverlayWindow();
      await stopCursorPolling(overlay, clickThroughRequested);
      await overlay.minimize();
    },
    async toggleMaximizeOverlay() {
      await (await getOverlayWindow()).toggleMaximize();
    },
    async closeOverlay() {
      // Hide instead of destroying the configured window so Main can show the Overlay again later.
      await platform.hideOverlay();
    },
    async setOverlayClickThrough(enabled: boolean) {
      const overlay = await getOverlayWindow();
      clickThroughRequested = enabled;
      if (enabled) {
        await setNativeCursorEventsIgnored(overlay, true);
        await startCursorPolling(overlay);
      } else {
        await stopCursorPolling(overlay, false);
      }
    },
    trackOverlayBarHover(listener: (hovered: boolean) => void) {
      overlayBarHoverListeners.add(listener);
      if (lastOverlayBarHovered !== null) listener(lastOverlayBarHovered);

      void getOverlayWindow()
        .then(async (overlay) => {
          if (!clickThroughRequested && !overlayBarHoverListeners.has(listener)) return;
          await startCursorPolling(overlay);
        })
        .catch((error: unknown) => {
          console.error("[Chlens Live] overlay bar hover tracking failed to start:", error);
        });

      return () => {
        overlayBarHoverListeners.delete(listener);
        if (overlayBarHoverListeners.size > 0 || clickThroughRequested) return;

        void getOverlayWindow()
          .then((overlay) => stopCursorPolling(overlay, false))
          .catch((error: unknown) => {
            console.error("[Chlens Live] overlay bar hover tracking failed to stop:", error);
          });
      };
    },
    async getOverlayGeometry() {
      return readOverlayGeometry(await getOverlayWindow());
    },
    async setOverlayGeometry(geometry: OverlayGeometry) {
      const normalized = fallbackOverlayGeometry(geometry);
      const overlay = await getOverlayWindow();
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

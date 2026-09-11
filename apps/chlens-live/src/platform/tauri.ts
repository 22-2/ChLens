import { availableMonitors, LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import type { CommentOverlayMonitor } from "src/features/comment-overlay/platform";

import {
  cloneOverlayGeometry,
  fallbackOverlayGeometry,
  fitOverlayGeometryToAspectRatio,
  loadStoredOverlayGeometry,
  saveStoredOverlayGeometry,
} from "./geometry";
import type { LiveWindowPlatform, OverlayGeometry } from "./types";

const OVERLAY_WINDOW_LABEL = "overlay";

interface PhysicalWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

async function getOverlayWindow(): Promise<Window> {
  // ネイティブウィンドウの操作はWindowへ集約し、OverlayのWebView内容には依存しない。
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
  // Tauriは外側の境界を物理pixelで返すため、操作パネルと保存値を論理pixelへ統一する。
  return {
    x: bounds.x / bounds.scaleFactor,
    y: bounds.y / bounds.scaleFactor,
    width: bounds.width / bounds.scaleFactor,
    height: bounds.height / bounds.scaleFactor,
  };
}

async function readOverlayMonitors(): Promise<readonly CommentOverlayMonitor[]> {
  const monitors = await availableMonitors();
  return monitors
    .map((monitor, index) => ({
      // モニター名が取れない環境でも、操作パネルで対象を選べるようfallback名を付ける。
      id: `monitor-${index + 1}`,
      name: monitor.name ?? `モニター${index + 1}`,
      x: monitor.position.x / monitor.scaleFactor,
      y: monitor.position.y / monitor.scaleFactor,
      width: monitor.size.width / monitor.scaleFactor,
      height: monitor.size.height / monitor.scaleFactor,
      scaleFactor: monitor.scaleFactor,
    }))
    .filter((monitor) => monitor.width > 0 && monitor.height > 0);
}

export function createTauriLiveWindowPlatform(): LiveWindowPlatform {
  const platform: LiveWindowPlatform = {
    async showOverlay() {
      const overlay = await getOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
    },
    async hideOverlay() {
      await (await getOverlayWindow()).hide();
    },
    async focusOverlay() {
      const overlay = await getOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      await overlay.setFocus();
    },
    async minimizeOverlay() {
      await (await getOverlayWindow()).minimize();
    },
    async toggleMaximizeOverlay() {
      await (await getOverlayWindow()).toggleMaximize();
    },
    async closeOverlay() {
      // ウィンドウを破棄せず非表示にすることで、Mainから再表示できる状態を保つ。
      await platform.hideOverlay();
    },
    async getOverlayMonitors() {
      return readOverlayMonitors();
    },
    async getOverlayGeometry() {
      return readOverlayGeometry(await getOverlayWindow());
    },
    async watchOverlayGeometry(listener: (nextGeometry: OverlayGeometry) => void) {
      const overlay = await getOverlayWindow();
      const [unlistenMoved, unlistenResized] = await Promise.all([
        overlay.onMoved(() => {
          void readOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[Chlens Live] overlay move geometry read failed:", error);
            });
        }),
        overlay.onResized(() => {
          void readOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[Chlens Live] overlay resize geometry read failed:", error);
            });
        }),
      ]);
      return () => {
        unlistenMoved();
        unlistenResized();
      };
    },
    async setOverlayGeometry(geometry: OverlayGeometry) {
      const normalized = fallbackOverlayGeometry(geometry);
      const overlay = await getOverlayWindow();
      await overlay.setPosition(new LogicalPosition(normalized.x, normalized.y));
      await overlay.setSize(new LogicalSize(normalized.width, normalized.height));
    },
    async loadOverlayGeometry() {
      const stored = loadStoredOverlayGeometry();
      if (!stored) return null;
      const restored = fitOverlayGeometryToAspectRatio(stored);
      // 起動時にnative windowへ保存済みgeometryを適用し、最初の表示から同じ配置にする。
      await platform.setOverlayGeometry(restored);
      if (JSON.stringify(restored) !== JSON.stringify(stored)) {
        saveStoredOverlayGeometry(restored);
      }
      return cloneOverlayGeometry(restored);
    },
    async saveOverlayGeometry(geometry: OverlayGeometry) {
      saveStoredOverlayGeometry(fitOverlayGeometryToAspectRatio(geometry));
    },
  };

  return platform;
}

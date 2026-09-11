import { emit, listen } from "@tauri-apps/api/event";
import { availableMonitors, LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import {
  cloneCommentOverlayGeometry,
  fitCommentOverlayGeometryToAspectRatio,
  fitCommentOverlayGeometryToWorkArea,
  fallbackCommentOverlayGeometry,
  loadStoredCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import type {
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";

const COMMENT_OVERLAY_WINDOW_LABEL = "comment-overlay";
export const COMMENT_OVERLAY_VISIBILITY_EVENT_NAME = "chlens://comment-overlay-visibility";

interface PhysicalWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

interface LogicalWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CommentOverlayVisibilityPayload {
  visible: boolean;
}

function isCommentOverlayVisibilityPayload(
  payload: unknown,
): payload is CommentOverlayVisibilityPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "visible" in payload &&
    typeof payload.visible === "boolean"
  );
}

async function getCommentOverlayWindow(): Promise<Window> {
  const overlay = await Window.getByLabel(COMMENT_OVERLAY_WINDOW_LABEL);
  if (!overlay) {
    throw new Error(`Tauri window '${COMMENT_OVERLAY_WINDOW_LABEL}' is not available`);
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

async function readCommentOverlayGeometry(window: Window): Promise<CommentOverlayGeometry> {
  const bounds = await readPhysicalWindowBounds(window);
  // Tauriは外側の境界を物理pixelで返すため、保存値と操作パネルを論理pixelへ統一する。
  return {
    x: bounds.x / bounds.scaleFactor,
    y: bounds.y / bounds.scaleFactor,
    width: bounds.width / bounds.scaleFactor,
    height: bounds.height / bounds.scaleFactor,
  };
}

async function readCommentOverlayMonitors(): Promise<readonly CommentOverlayMonitor[]> {
  const monitors = await availableMonitors();
  return monitors
    .map((monitor, index) => ({
      // 変更理由: モニター名は環境によってnullになるため、操作パネルで常に識別できる
      // 安定したfallback id/nameを生成する。
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

async function fitGeometryToAvailableMonitor(
  geometry: CommentOverlayGeometry,
): Promise<CommentOverlayGeometry> {
  const monitors = await availableMonitors();
  const workAreas: LogicalWorkArea[] = monitors
    .map((monitor) => ({
      x: monitor.workArea.position.x / monitor.scaleFactor,
      y: monitor.workArea.position.y / monitor.scaleFactor,
      width: monitor.workArea.size.width / monitor.scaleFactor,
      height: monitor.workArea.size.height / monitor.scaleFactor,
    }))
    .filter((workArea) => workArea.width > 0 && workArea.height > 0);
  if (workAreas.length === 0) return fallbackCommentOverlayGeometry(geometry);

  const normalized = fallbackCommentOverlayGeometry(geometry);
  const centerX = normalized.x + normalized.width / 2;
  const centerY = normalized.y + normalized.height / 2;
  const workArea =
    workAreas.find(
      (candidate) =>
        centerX >= candidate.x &&
        centerX <= candidate.x + candidate.width &&
        centerY >= candidate.y &&
        centerY <= candidate.y + candidate.height,
    ) ?? workAreas[0];

  return fitCommentOverlayGeometryToWorkArea(normalized, workArea);
}

export function createTauriCommentOverlayPlatform(): CommentOverlayWindowPlatform {
  const publishWindowVisibility = async (visible: boolean): Promise<void> => {
    // MainとOverlayは別WebViewでplatform instanceも分かれるため、broadcastで状態を共有する。
    await emit(COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, { visible });
  };

  const platform: CommentOverlayWindowPlatform = {
    async show() {
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      await publishWindowVisibility(true);
    },
    async hide() {
      await (await getCommentOverlayWindow()).hide();
      await publishWindowVisibility(false);
    },
    async focus() {
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      await publishWindowVisibility(true);
      await overlay.setFocus();
    },
    async minimize() {
      await (await getCommentOverlayWindow()).minimize();
      await publishWindowVisibility(false);
    },
    async toggleMaximize() {
      await (await getCommentOverlayWindow()).toggleMaximize();
    },
    async close() {
      // ウィンドウを破棄せず非表示にすることで、Mainから再表示できる状態を保つ。
      await platform.hide();
    },
    async watchVisibility(listener: (visible: boolean) => void) {
      const unlisten = await listen<CommentOverlayVisibilityPayload>(
        COMMENT_OVERLAY_VISIBILITY_EVENT_NAME,
        ({ payload }) => {
          if (!isCommentOverlayVisibilityPayload(payload)) {
            console.error("[ChLens] コメントOverlayの表示状態eventを検証できません:", payload);
            return;
          }
          listener(payload.visible);
        },
      );

      try {
        const visible = await (await getCommentOverlayWindow()).isVisible();
        listener(visible);
      } catch (error: unknown) {
        console.error("[ChLens] コメントOverlayの初期表示状態同期に失敗しました:", error);
      }

      return unlisten;
    },
    async getMonitors() {
      return readCommentOverlayMonitors();
    },
    async getGeometry() {
      return readCommentOverlayGeometry(await getCommentOverlayWindow());
    },
    async watchGeometry(listener: (geometry: CommentOverlayGeometry) => void) {
      const overlay = await getCommentOverlayWindow();
      const [unlistenMoved, unlistenResized] = await Promise.all([
        overlay.onMoved(() => {
          void readCommentOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[ChLens] コメントOverlayの移動geometry取得に失敗しました:", error);
            });
        }),
        overlay.onResized(() => {
          void readCommentOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[ChLens] コメントOverlayのリサイズgeometry取得に失敗しました:", error);
            });
        }),
      ]);
      return () => {
        unlistenMoved();
        unlistenResized();
      };
    },
    async setGeometry(geometry: CommentOverlayGeometry) {
      const normalized = fallbackCommentOverlayGeometry(geometry);
      const overlay = await getCommentOverlayWindow();
      await overlay.setPosition(new LogicalPosition(normalized.x, normalized.y));
      await overlay.setSize(new LogicalSize(normalized.width, normalized.height));
    },
    async loadGeometry() {
      const stored = loadStoredCommentOverlayGeometry();
      if (!stored) return null;

      let restored = fitCommentOverlayGeometryToAspectRatio(stored);
      try {
        // 変更理由: モニター構成やタスクバー位置が変わっても、保存済みOverlayを
        // 完全に画面外へ残さず操作パネルから復帰できるよう、復元時だけwork areaへ収める。
        restored = await fitGeometryToAvailableMonitor(restored);
      } catch (error: unknown) {
        console.error("[ChLens] コメントOverlayのwork area取得に失敗しました:", error);
      }
      await platform.setGeometry(restored);
      if (JSON.stringify(restored) !== JSON.stringify(stored)) {
        saveStoredCommentOverlayGeometry(restored);
      }
      return cloneCommentOverlayGeometry(restored);
    },
    async saveGeometry(geometry: CommentOverlayGeometry) {
      saveStoredCommentOverlayGeometry(fitCommentOverlayGeometryToAspectRatio(geometry));
    },
  };

  return platform;
}

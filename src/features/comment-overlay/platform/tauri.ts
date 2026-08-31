import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { availableMonitors, LogicalPosition, LogicalSize, Window } from "@tauri-apps/api/window";
import {
  cloneCommentOverlayGeometry,
  fitCommentOverlayGeometryToWorkArea,
  fallbackCommentOverlayGeometry,
  loadStoredCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import {
  COMMENT_OVERLAY_CONTROL_BAR_HEIGHT,
  type CommentOverlayGeometry,
  type CommentOverlayResizeDirection,
  type CommentOverlayWindowPlatform,
} from "./types";

const COMMENT_OVERLAY_WINDOW_LABEL = "comment-overlay";
export const COMMENT_OVERLAY_VISIBILITY_EVENT_NAME = "chlens://comment-overlay-visibility";
const CURSOR_POLL_INTERVAL_MS = 100;
const CURSOR_REENABLE_DELAY_MS = 220;
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
  // Tauriは外側の境界を物理pixelで返すため、DPI変更後も復元できる論理pixelへ変換する。
  return {
    x: bounds.x / bounds.scaleFactor,
    y: bounds.y / bounds.scaleFactor,
    width: bounds.width / bounds.scaleFactor,
    height: bounds.height / bounds.scaleFactor,
  };
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

export function getCommentOverlayCursorHitRegion(
  cursor: CursorPosition,
  bounds: PhysicalWindowBounds,
): CursorHitRegion {
  const insideWindow =
    cursor.x >= bounds.x &&
    cursor.x <= bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y <= bounds.y + bounds.height;
  if (!insideWindow) return "outside";

  // 透明領域は背後へ通し、操作バーと外周リサイズ領域だけを一時的に受け取る。
  const edgeSize = INTERACTIVE_EDGE_SIZE * bounds.scaleFactor;
  const barHeight =
    (CONTROL_BAR_TOP_INSET + COMMENT_OVERLAY_CONTROL_BAR_HEIGHT) * bounds.scaleFactor;
  // 変更理由: 操作バーはOverlay上端からinset分だけ下にあるため、上枠までbar扱いにすると
  // バー外のhoverで操作ボタンが表示される。DOMのtop位置と同じ下限から判定する。
  const barTop = bounds.y + CONTROL_BAR_TOP_INSET * bounds.scaleFactor;
  const barLeft = bounds.x + CONTROL_BAR_HORIZONTAL_INSET * bounds.scaleFactor;
  const barRight = bounds.x + bounds.width - CONTROL_BAR_HORIZONTAL_INSET * bounds.scaleFactor;
  const insideBar =
    cursor.x >= barLeft &&
    cursor.x <= barRight &&
    cursor.y >= barTop &&
    cursor.y <= bounds.y + barHeight;
  if (insideBar) return "bar";

  return cursor.x <= bounds.x + edgeSize ||
    cursor.x >= bounds.x + bounds.width - edgeSize ||
    cursor.y >= bounds.y + bounds.height - edgeSize
    ? "resize"
    : "outside";
}

export function createTauriCommentOverlayPlatform(): CommentOverlayWindowPlatform {
  let clickThroughRequested = false;
  let cursorPollTimer: ReturnType<typeof setInterval> | null = null;
  let cursorReenableTimer: ReturnType<typeof setTimeout> | null = null;
  let cursorPollInFlight = false;
  let nativeCursorEventsIgnored: boolean | null = null;
  let nativeCursorMutation: Promise<void> = Promise.resolve();
  let cursorPollingStartPromise: Promise<void> | null = null;
  // tauri.conf.jsonでOverlayは初期非表示のため、frontend初期化中のpollingを開始しない。
  let windowVisible = false;
  const barHoverListeners = new Set<(hovered: boolean) => void>();
  let lastBarHovered: boolean | null = null;

  const notifyBarHover = (hovered: boolean): void => {
    if (lastBarHovered === hovered) return;
    lastBarHovered = hovered;
    for (const listener of barHoverListeners) {
      try {
        listener(hovered);
      } catch (error: unknown) {
        console.error("[ChLens] コメントOverlayのhover listenerでエラーが発生しました:", error);
      }
    }
  };

  const setNativeCursorEventsIgnored = async (overlay: Window, ignored: boolean): Promise<void> => {
    nativeCursorMutation = nativeCursorMutation
      .catch(() => undefined)
      .then(async () => {
        if (nativeCursorEventsIgnored === ignored) return;

        // Windows側のhit-test切り替えを直列化し、前回のWebView更新中の競合を防ぐ。
        await overlay.setIgnoreCursorEvents(ignored);
        nativeCursorEventsIgnored = ignored;
      });
    await nativeCursorMutation;
  };

  const updateCursorHitTest = async (overlay: Window): Promise<void> => {
    if ((!clickThroughRequested && barHoverListeners.size === 0) || cursorPollInFlight) return;

    cursorPollInFlight = true;
    try {
      const [cursor, bounds] = await Promise.all([
        invoke<CursorPosition>("get_cursor_position"),
        readPhysicalWindowBounds(overlay),
      ]);
      const hitRegion = getCommentOverlayCursorHitRegion(cursor, bounds);
      notifyBarHover(hitRegion === "bar");

      if (!clickThroughRequested) return;

      if (hitRegion !== "outside") {
        if (cursorReenableTimer) {
          clearTimeout(cursorReenableTimer);
          cursorReenableTimer = null;
        }
        await setNativeCursorEventsIgnored(overlay, false);
      } else if (nativeCursorEventsIgnored === false && !cursorReenableTimer) {
        // 境界通過直後の揺れを吸収して、クリック透過がちらつくのを防ぐ。
        cursorReenableTimer = setTimeout(() => {
          cursorReenableTimer = null;
          if (!clickThroughRequested) return;
          void setNativeCursorEventsIgnored(overlay, true).catch((error: unknown) => {
            console.error("[ChLens] コメントOverlayのクリック透過復帰に失敗しました:", error);
          });
        }, CURSOR_REENABLE_DELAY_MS);
      }
    } catch (error: unknown) {
      console.error("[ChLens] コメントOverlayのcursor hit-testに失敗しました:", error);
    } finally {
      cursorPollInFlight = false;
    }
  };

  const startCursorPolling = async (overlay: Window): Promise<void> => {
    if (!windowVisible) return;
    if (clickThroughRequested) await setNativeCursorEventsIgnored(overlay, true);
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
    // 変更理由: 非表示中やクリック透過解除後もintervalを残すと、native windowが見えなくても
    // cursor位置commandを呼び続ける。再表示時は保持した要求を見てstartCursorPollingで再開する。
    if (cursorPollTimer) {
      clearInterval(cursorPollTimer);
      cursorPollTimer = null;
      lastBarHovered = null;
    }
    if (cursorReenableTimer) {
      clearTimeout(cursorReenableTimer);
      cursorReenableTimer = null;
    }
    if (!keepRequest) clickThroughRequested = false;
    await setNativeCursorEventsIgnored(overlay, keepRequest);
  };

  const syncWindowVisibility = async (visible: boolean): Promise<void> => {
    if (windowVisible === visible) return;

    const overlay = await getCommentOverlayWindow();
    windowVisible = visible;
    if (visible) {
      if (clickThroughRequested || barHoverListeners.size > 0) {
        await startCursorPolling(overlay);
      }
      return;
    }

    await stopCursorPolling(overlay, clickThroughRequested);
  };

  const publishWindowVisibility = async (visible: boolean): Promise<void> => {
    // MainとOverlayは別WebViewでplatform instanceも分かれるため、
    // emitToで片方だけへ送らず、両方が同じnative状態を受け取れるようbroadcastする。
    await emit(COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, { visible });
  };

  const platform: CommentOverlayWindowPlatform = {
    async show() {
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      windowVisible = true;
      await publishWindowVisibility(true);
      if (clickThroughRequested || barHoverListeners.size > 0) await startCursorPolling(overlay);
    },
    async hide() {
      const overlay = await getCommentOverlayWindow();
      await stopCursorPolling(overlay, clickThroughRequested);
      await overlay.hide();
      windowVisible = false;
      await publishWindowVisibility(false);
    },
    async focus() {
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      windowVisible = true;
      await publishWindowVisibility(true);
      if (clickThroughRequested || barHoverListeners.size > 0) await startCursorPolling(overlay);
      await overlay.setFocus();
    },
    async startResizing(direction: CommentOverlayResizeDirection) {
      await (await getCommentOverlayWindow()).startResizeDragging(direction);
    },
    async minimize() {
      const overlay = await getCommentOverlayWindow();
      await stopCursorPolling(overlay, clickThroughRequested);
      await overlay.minimize();
      windowVisible = false;
      await publishWindowVisibility(false);
    },
    async toggleMaximize() {
      await (await getCommentOverlayWindow()).toggleMaximize();
    },
    async close() {
      // ウィンドウを破棄せず非表示にすることで、Mainから再表示できる状態を保つ。
      await platform.hide();
    },
    async setClickThrough(enabled: boolean) {
      const overlay = await getCommentOverlayWindow();
      clickThroughRequested = enabled;
      if (enabled) {
        await setNativeCursorEventsIgnored(overlay, true);
        await startCursorPolling(overlay);
      } else {
        await stopCursorPolling(overlay, false);
        if (barHoverListeners.size > 0) await startCursorPolling(overlay);
      }
    },
    async watchVisibility(listener: (visible: boolean) => void) {
      const unlisten = await listen<CommentOverlayVisibilityPayload>(
        COMMENT_OVERLAY_VISIBILITY_EVENT_NAME,
        ({ payload }) => {
          if (!isCommentOverlayVisibilityPayload(payload)) {
            console.error("[ChLens] コメントOverlayの表示状態eventを検証できません:", payload);
            return;
          }
          void syncWindowVisibility(payload.visible).catch((error: unknown) => {
            console.error("[ChLens] コメントOverlayの表示状態同期に失敗しました:", error);
          });
          listener(payload.visible);
        },
      );

      try {
        const visible = await (await getCommentOverlayWindow()).isVisible();
        // Overlayのreloadや監視登録の遅れでbroadcastを取りこぼしても、
        // 登録直後にnative windowへ問い合わせて現在状態へ追いつけるようにする。
        await syncWindowVisibility(visible);
      } catch (error: unknown) {
        console.error("[ChLens] コメントOverlayの初期表示状態同期に失敗しました:", error);
      }

      return unlisten;
    },
    trackBarHover(listener: (hovered: boolean) => void) {
      barHoverListeners.add(listener);
      if (lastBarHovered !== null) listener(lastBarHovered);

      void getCommentOverlayWindow()
        .then((overlay) => startCursorPolling(overlay))
        .catch((error: unknown) => {
          console.error("[ChLens] コメントOverlayのbar hover監視開始に失敗しました:", error);
        });

      return () => {
        barHoverListeners.delete(listener);
        if (barHoverListeners.size > 0 || clickThroughRequested) return;
        void getCommentOverlayWindow()
          .then((overlay) => stopCursorPolling(overlay, false))
          .catch((error: unknown) => {
            console.error("[ChLens] コメントOverlayのbar hover監視停止に失敗しました:", error);
          });
      };
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

      let restored = stored;
      try {
        // 変更理由: モニター構成の変更やタスクバー位置の変更後も、保存済みOverlayが
        // 完全に画面外へ残ると操作不能になるため、復元時だけ現在のwork areaへ収める。
        restored = await fitGeometryToAvailableMonitor(stored);
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
      saveStoredCommentOverlayGeometry(geometry);
    },
  };

  return platform;
}

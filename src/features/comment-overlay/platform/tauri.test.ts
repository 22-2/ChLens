import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  event: {
    emit: vi.fn(),
    listen: vi.fn(),
  },
  logicalPosition: class MockLogicalPosition {
    constructor(
      readonly x: number,
      readonly y: number,
    ) {}
  },
  logicalSize: class MockLogicalSize {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
  },
  availableMonitors: vi.fn(),
  window: {
    getByLabel: vi.fn(),
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    scaleFactor: vi.fn(),
    isVisible: vi.fn(),
    setIgnoreCursorEvents: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    unminimize: vi.fn(),
    setFocus: vi.fn(),
    startResizeDragging: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    onMoved: vi.fn(),
    onResized: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: tauriMocks.event.emit,
  listen: tauriMocks.event.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: tauriMocks.availableMonitors,
  LogicalPosition: tauriMocks.logicalPosition,
  LogicalSize: tauriMocks.logicalSize,
  Window: {
    getByLabel: tauriMocks.window.getByLabel,
  },
}));

import { COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY } from "./geometry";
import { COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, createTauriCommentOverlayPlatform } from "./tauri";

type VisibilityEventHandler = (event: { payload: unknown }) => void;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("TauriコメントOverlay window platform", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue({ x: 0, y: 0 });
    tauriMocks.event.emit.mockReset();
    tauriMocks.event.emit.mockResolvedValue(undefined);
    tauriMocks.event.listen.mockReset();
    tauriMocks.event.listen.mockResolvedValue(vi.fn());
    tauriMocks.window.getByLabel.mockReset();
    tauriMocks.window.getByLabel.mockResolvedValue(tauriMocks.window);
    tauriMocks.window.outerPosition.mockReset();
    tauriMocks.window.outerPosition.mockResolvedValue({ x: 200, y: 100 });
    tauriMocks.window.outerSize.mockReset();
    tauriMocks.window.outerSize.mockResolvedValue({ width: 1_800, height: 320 });
    tauriMocks.window.scaleFactor.mockReset();
    tauriMocks.window.scaleFactor.mockResolvedValue(2);
    tauriMocks.availableMonitors.mockReset();
    tauriMocks.availableMonitors.mockResolvedValue([
      {
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: 3_840, height: 2_080 },
        },
        scaleFactor: 2,
      },
    ]);
    tauriMocks.window.isVisible.mockReset();
    tauriMocks.window.isVisible.mockResolvedValue(false);
    tauriMocks.window.setIgnoreCursorEvents.mockReset();
    tauriMocks.window.setIgnoreCursorEvents.mockResolvedValue(undefined);
    tauriMocks.window.setPosition.mockReset();
    tauriMocks.window.setPosition.mockResolvedValue(undefined);
    tauriMocks.window.setSize.mockReset();
    tauriMocks.window.setSize.mockResolvedValue(undefined);
    tauriMocks.window.onMoved.mockReset();
    tauriMocks.window.onMoved.mockResolvedValue(vi.fn());
    tauriMocks.window.onResized.mockReset();
    tauriMocks.window.onResized.mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("物理pixelのwindow境界を論理geometryへ変換する", async () => {
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.getGeometry()).resolves.toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 160,
    });
  });

  it("geometry設定を論理座標のままnative windowへ適用する", async () => {
    const platform = createTauriCommentOverlayPlatform();

    await platform.setGeometry({ x: 24, y: 48, width: 1, height: 1 });

    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 24, y: 48 }),
    );
    expect(tauriMocks.window.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 320, height: 80 }),
    );
  });

  it("保存済みgeometryを読み込みnative windowへ復元する", async () => {
    localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify({ x: 32, y: 64, width: 640, height: 128 }),
    );
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.loadGeometry()).resolves.toEqual({
      x: 32,
      y: 64,
      width: 640,
      height: 128,
    });
    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 32, y: 64 }),
    );
    expect(tauriMocks.window.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 640, height: 128 }),
    );
  });

  it("保存位置が画面外ならwork area内へ戻して復元する", async () => {
    localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify({ x: 1_800, y: -100, width: 900, height: 240 }),
    );
    const platform = createTauriCommentOverlayPlatform();

    await expect(platform.loadGeometry()).resolves.toEqual({
      x: 1_020,
      y: 0,
      width: 900,
      height: 240,
    });
    expect(tauriMocks.window.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1_020, y: 0 }),
    );
    expect(localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY)).toBe(
      JSON.stringify({ x: 1_020, y: 0, width: 900, height: 240 }),
    );
  });

  it("移動とリサイズのnative eventを論理geometryへ通知し、解除関数を返す", async () => {
    let movedHandler: (() => void) | undefined;
    let resizedHandler: (() => void) | undefined;
    const unlistenMoved = vi.fn();
    const unlistenResized = vi.fn();
    tauriMocks.window.onMoved.mockImplementationOnce(async (handler: () => void) => {
      movedHandler = handler;
      return unlistenMoved;
    });
    tauriMocks.window.onResized.mockImplementationOnce(async (handler: () => void) => {
      resizedHandler = handler;
      return unlistenResized;
    });
    const listener = vi.fn();
    const platform = createTauriCommentOverlayPlatform();

    const cleanup = await platform.watchGeometry(listener);
    movedHandler?.();
    resizedHandler?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).toHaveBeenCalledWith({
      x: 100,
      y: 50,
      width: 900,
      height: 160,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    cleanup();
    expect(unlistenMoved).toHaveBeenCalledTimes(1);
    expect(unlistenResized).toHaveBeenCalledTimes(1);
  });

  it("クリック透過を開始するとnative cursor eventを無視し、解除時に戻す", async () => {
    vi.useFakeTimers();
    const platform = createTauriCommentOverlayPlatform();

    await platform.setClickThrough(true);
    // Overlayは起動直後に非表示なので、表示前のcursor pollingは開始しない。
    expect(vi.getTimerCount()).toBe(0);

    await platform.show();
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenNthCalledWith(1, true);
    expect(vi.getTimerCount()).toBe(1);

    await platform.setClickThrough(false);
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("非表示でpollingを止め、再表示時にクリック透過とpollingを復帰する", async () => {
    vi.useFakeTimers();
    const platform = createTauriCommentOverlayPlatform();

    await platform.show();
    await platform.setClickThrough(true);
    await platform.hide();
    expect(vi.getTimerCount()).toBe(0);
    expect(tauriMocks.window.hide).toHaveBeenCalledTimes(1);

    await platform.show();
    expect(vi.getTimerCount()).toBe(1);
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenLastCalledWith(true);

    await platform.setClickThrough(false);
  });

  it("Overlayを閉じるとnative windowを隠し、全WebViewへ非表示を通知する", async () => {
    tauriMocks.window.hide.mockClear();
    const platform = createTauriCommentOverlayPlatform();

    await platform.close();

    expect(tauriMocks.window.hide).toHaveBeenCalledTimes(1);
    expect(tauriMocks.event.emit).toHaveBeenCalledWith(COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, {
      visible: false,
    });
  });

  it("表示中のnative windowを監視開始時に同期してpollingを開始する", async () => {
    vi.useFakeTimers();
    tauriMocks.window.isVisible.mockResolvedValue(true);
    const platform = createTauriCommentOverlayPlatform();

    await platform.setClickThrough(true);
    expect(vi.getTimerCount()).toBe(0);

    await platform.watchVisibility(() => {});

    expect(vi.getTimerCount()).toBe(1);
    await platform.setClickThrough(false);
  });

  it("Main向けの表示状態eventを受け取り、解除関数を返す", async () => {
    let visibilityHandler: VisibilityEventHandler | undefined;
    const unlisten = vi.fn();
    tauriMocks.event.listen.mockImplementationOnce(
      async (_eventName: string, handler: VisibilityEventHandler) => {
        visibilityHandler = handler;
        return unlisten;
      },
    );
    const listener = vi.fn();
    const platform = createTauriCommentOverlayPlatform();

    const cleanup = await platform.watchVisibility(listener);
    visibilityHandler?.({ payload: { visible: false } });

    expect(listener).toHaveBeenCalledWith(false);
    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

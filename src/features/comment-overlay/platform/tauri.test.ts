import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
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
  window: {
    getByLabel: vi.fn(),
    outerPosition: vi.fn(),
    outerSize: vi.fn(),
    scaleFactor: vi.fn(),
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

vi.mock("@tauri-apps/api/window", () => ({
  LogicalPosition: tauriMocks.logicalPosition,
  LogicalSize: tauriMocks.logicalSize,
  Window: {
    getByLabel: tauriMocks.window.getByLabel,
  },
}));

import { COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY } from "./geometry";
import { createTauriCommentOverlayPlatform } from "./tauri";

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
    tauriMocks.window.getByLabel.mockReset();
    tauriMocks.window.getByLabel.mockResolvedValue(tauriMocks.window);
    tauriMocks.window.outerPosition.mockReset();
    tauriMocks.window.outerPosition.mockResolvedValue({ x: 200, y: 100 });
    tauriMocks.window.outerSize.mockReset();
    tauriMocks.window.outerSize.mockResolvedValue({ width: 1_800, height: 320 });
    tauriMocks.window.scaleFactor.mockReset();
    tauriMocks.window.scaleFactor.mockResolvedValue(2);
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
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenNthCalledWith(1, true);
    expect(vi.getTimerCount()).toBe(1);

    await platform.setClickThrough(false);
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("非表示でpollingを止め、再表示時にクリック透過とpollingを復帰する", async () => {
    vi.useFakeTimers();
    const platform = createTauriCommentOverlayPlatform();

    await platform.setClickThrough(true);
    await platform.hide();
    expect(vi.getTimerCount()).toBe(0);
    expect(tauriMocks.window.hide).toHaveBeenCalledTimes(1);

    await platform.show();
    expect(vi.getTimerCount()).toBe(1);
    expect(tauriMocks.window.setIgnoreCursorEvents).toHaveBeenLastCalledWith(true);

    await platform.setClickThrough(false);
  });
});

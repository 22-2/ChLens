import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserLiveWindowPlatform } from "./browser";
import { constrainOverlayGeometryToAspectRatio } from "./geometry";
import { DEFAULT_OVERLAY_GEOMETRY } from "./types";

describe("Live window platform", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    } as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("browser fallback saves and restores overlay geometry without Tauri APIs", async () => {
    const platform = createBrowserLiveWindowPlatform();
    const geometry = { x: 120, y: 240, width: 720, height: 140 };
    const migratedGeometry = { ...geometry, height: 405 };

    await platform.setOverlayGeometry(geometry);
    await platform.saveOverlayGeometry(geometry);

    const nextPlatform = createBrowserLiveWindowPlatform();
    expect(await nextPlatform.loadOverlayGeometry()).toEqual(migratedGeometry);
    expect(await nextPlatform.getOverlayGeometry()).toEqual(migratedGeometry);
  });

  it("uses the safe default when no geometry has been stored", async () => {
    const platform = createBrowserLiveWindowPlatform();

    expect(await platform.loadOverlayGeometry()).toBeNull();
    expect(await platform.getOverlayGeometry()).toEqual(DEFAULT_OVERLAY_GEOMETRY);
  });
});

describe("Overlayの縦横比固定", () => {
  it("右辺のリサイズでは左端を保って高さを中央へ広げる", () => {
    expect(
      constrainOverlayGeometryToAspectRatio(
        { x: 80, y: 80, width: 900, height: 506 },
        { x: 80, y: 80, width: 1_125, height: 506 },
        "East",
      ),
    ).toEqual({ x: 80, y: 17, width: 1_125, height: 633 });
  });

  it("左上隅では右下を保ったまま大きくする", () => {
    expect(
      constrainOverlayGeometryToAspectRatio(
        { x: 80, y: 80, width: 900, height: 506 },
        { x: -145, y: 40, width: 1_125, height: 633 },
        "NorthWest",
      ),
    ).toEqual({ x: -145, y: 40, width: 1_125, height: 633 });
  });
});

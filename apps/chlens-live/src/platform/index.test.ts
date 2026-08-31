import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserLiveWindowPlatform } from "./browser";
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

    await platform.setOverlayGeometry(geometry);
    await platform.saveOverlayGeometry(geometry);

    const nextPlatform = createBrowserLiveWindowPlatform();
    expect(await nextPlatform.loadOverlayGeometry()).toEqual(geometry);
    expect(await nextPlatform.getOverlayGeometry()).toEqual(geometry);
  });

  it("uses the safe default when no geometry has been stored", async () => {
    const platform = createBrowserLiveWindowPlatform();

    expect(await platform.loadOverlayGeometry()).toBeNull();
    expect(await platform.getOverlayGeometry()).toEqual(DEFAULT_OVERLAY_GEOMETRY);
  });
});

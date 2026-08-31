import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
  fitCommentOverlayGeometryToWorkArea,
  fallbackCommentOverlayGeometry,
  loadStoredCommentOverlayGeometry,
  normalizeCommentOverlayGeometry,
  parseCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import { DEFAULT_COMMENT_OVERLAY_GEOMETRY } from "./types";

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

describe("コメントOverlayのgeometry", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("座標を整数化し、操作可能な最小サイズを保証する", () => {
    expect(
      normalizeCommentOverlayGeometry({
        x: 10.6,
        y: -8.4,
        width: 100.4,
        height: 79.6,
      }),
    ).toEqual({
      x: 11,
      y: -8,
      width: 320,
      height: 80,
    });
  });

  it("保存したgeometryを正規化した状態で復元する", () => {
    saveStoredCommentOverlayGeometry({
      x: 24.4,
      y: 48.6,
      width: 1,
      height: 1,
    });

    expect(localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY)).toBe(
      JSON.stringify({ x: 24, y: 49, width: 320, height: 80 }),
    );
    expect(loadStoredCommentOverlayGeometry()).toEqual({
      x: 24,
      y: 49,
      width: 320,
      height: 80,
    });
  });

  it("保存位置をwork area内へ収める", () => {
    expect(
      fitCommentOverlayGeometryToWorkArea(
        { x: 1_800, y: -100, width: 900, height: 240 },
        { x: 0, y: 0, width: 1_920, height: 1_040 },
      ),
    ).toEqual({
      x: 1_020,
      y: 0,
      width: 900,
      height: 240,
    });
  });

  it("work areaより大きいgeometryは表示可能なサイズへ縮める", () => {
    expect(
      fitCommentOverlayGeometryToWorkArea(
        { x: -100, y: -100, width: 2_400, height: 1_200 },
        { x: 0, y: 0, width: 1_920, height: 1_040 },
      ),
    ).toEqual({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_040,
    });
  });

  it("不正な保存値は既定geometryへフォールバックできる", () => {
    localStorage.setItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY, "{broken");

    expect(loadStoredCommentOverlayGeometry()).toBeNull();
    expect(fallbackCommentOverlayGeometry(loadStoredCommentOverlayGeometry())).toEqual(
      DEFAULT_COMMENT_OVERLAY_GEOMETRY,
    );
  });

  it("必須フィールドが欠けたJSONをgeometryとして受け入れない", () => {
    expect(parseCommentOverlayGeometry(JSON.stringify({ x: 0, y: 0, width: 900 }))).toBeNull();
  });
});

import { DEFAULT_OVERLAY_GEOMETRY, OVERLAY_ASPECT_RATIO, type OverlayGeometry } from "./types";

export const OVERLAY_GEOMETRY_STORAGE_KEY = "chlens-live:overlay-geometry";

export function normalizeOverlayGeometry(geometry: OverlayGeometry): OverlayGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.max(320, Math.round(geometry.width)),
    height: Math.max(80, Math.round(geometry.height)),
  };
}

export function parseOverlayGeometry(raw: string | null): OverlayGeometry | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OverlayGeometry>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return normalizeOverlayGeometry(parsed as OverlayGeometry);
  } catch (error) {
    console.error("[Chlens Live] overlay geometry parse failed:", error);
    return null;
  }
}

export function loadStoredOverlayGeometry(): OverlayGeometry | null {
  try {
    return parseOverlayGeometry(globalThis.localStorage.getItem(OVERLAY_GEOMETRY_STORAGE_KEY));
  } catch (error) {
    console.error("[Chlens Live] overlay geometry load failed:", error);
    return null;
  }
}

export function saveStoredOverlayGeometry(geometry: OverlayGeometry): void {
  try {
    globalThis.localStorage.setItem(
      OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify(normalizeOverlayGeometry(geometry)),
    );
  } catch (error) {
    console.error("[Chlens Live] overlay geometry save failed:", error);
  }
}

export function cloneOverlayGeometry(geometry: OverlayGeometry): OverlayGeometry {
  return { ...geometry };
}

/** 保存済みgeometryを16:9へ移行し、既存の左上位置は変えずに操作領域を保つ。 */
export function fitOverlayGeometryToAspectRatio(geometry: OverlayGeometry): OverlayGeometry {
  const normalized = normalizeOverlayGeometry(geometry);
  // 変更理由: 旧版では高さだけを変更した一時的な比率も保存されていたため、
  // 操作パネルの16:9ルールへ移行する。幅を基準にすることで表示サイズを小さくしない。
  return normalizeOverlayGeometry({
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.width / OVERLAY_ASPECT_RATIO,
  });
}

export function fallbackOverlayGeometry(geometry: OverlayGeometry | null): OverlayGeometry {
  return cloneOverlayGeometry(geometry ?? DEFAULT_OVERLAY_GEOMETRY);
}

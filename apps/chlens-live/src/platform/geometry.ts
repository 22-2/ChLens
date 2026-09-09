import {
  DEFAULT_OVERLAY_GEOMETRY,
  OVERLAY_ASPECT_RATIO,
  type OverlayGeometry,
  type OverlayResizeDirection,
} from "./types";

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

/** リサイズ開始時の縦横比を保ち、操作した辺の反対側を動かさずに寸法を補正する。 */
export function constrainOverlayGeometryToAspectRatio(
  origin: OverlayGeometry,
  resized: OverlayGeometry,
  direction: OverlayResizeDirection,
): OverlayGeometry {
  // 変更理由: EdgeLiveViewerは保存済みの一時的な縦横比ではなく16:9を基準にするため、
  // 旧版で保存された900x160のgeometryを次回起動時にそのまま再利用しない。
  const aspectRatio = OVERLAY_ASPECT_RATIO;
  const hasHorizontalHandle = direction.includes("East") || direction.includes("West");
  const hasVerticalHandle = direction.includes("North") || direction.includes("South");
  const widthChangeRatio = Math.abs(resized.width / Math.max(1, origin.width) - 1);
  const heightChangeRatio = Math.abs(resized.height / Math.max(1, origin.height) - 1);
  const useWidth =
    hasHorizontalHandle && (!hasVerticalHandle || widthChangeRatio >= heightChangeRatio);

  let width = useWidth ? resized.width : resized.height * aspectRatio;
  let height = useWidth ? resized.width / aspectRatio : resized.height;
  const minimumScale = Math.max(320 / width, 80 / height, 1);
  width = Math.round(width * minimumScale);
  height = Math.round(height * minimumScale);

  let x = resized.x;
  let y = resized.y;
  if (direction.includes("West")) {
    x = resized.x + resized.width - width;
  } else if (!hasHorizontalHandle) {
    x = resized.x + (resized.width - width) / 2;
  }
  if (direction.includes("North")) {
    y = resized.y + resized.height - height;
  } else if (!hasVerticalHandle) {
    y = resized.y + (resized.height - height) / 2;
  }

  // 変更理由: EdgeLiveViewerは縦横比固定を既定にしており、片辺だけを操作しても
  // フォント・行間・移動距離が同じ倍率で変わるため、ウィンドウ寸法も一様に拡縮する。
  return normalizeOverlayGeometry({ x, y, width, height });
}

/** 保存済みgeometryを16:9へ移行し、既存の左上位置は変えずに操作領域を保つ。 */
export function fitOverlayGeometryToAspectRatio(geometry: OverlayGeometry): OverlayGeometry {
  const normalized = normalizeOverlayGeometry(geometry);
  // 変更理由: 保存値の高さは旧版の900x160など一時的な比率を含むため、対角リサイズの
  // 軸判定へ渡すと高さ側を基準に320x180まで縮む。移行時は幅を基準に16:9へ揃え、
  // ユーザーが保存した表示サイズを小さくしない。
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

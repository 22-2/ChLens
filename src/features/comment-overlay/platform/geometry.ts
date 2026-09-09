import {
  COMMENT_OVERLAY_ASPECT_RATIO,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  type CommentOverlayGeometry,
  type CommentOverlayResizeDirection,
} from "./types";

export const COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY = "chlens:comment-overlay-geometry";

export interface CommentOverlayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeCommentOverlayGeometry(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.max(320, Math.round(geometry.width)),
    height: Math.max(80, Math.round(geometry.height)),
  };
}

export function fitCommentOverlayGeometryToWorkArea(
  geometry: CommentOverlayGeometry,
  workArea: CommentOverlayWorkArea,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  const width = Math.min(normalized.width, Math.max(1, Math.round(workArea.width)));
  const height = Math.min(normalized.height, Math.max(1, Math.round(workArea.height)));
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: clamp(normalized.x, Math.round(workArea.x), Math.round(maxX)),
    y: clamp(normalized.y, Math.round(workArea.y), Math.round(maxY)),
    width,
    height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function parseCommentOverlayGeometry(raw: string | null): CommentOverlayGeometry | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CommentOverlayGeometry>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return normalizeCommentOverlayGeometry(parsed as CommentOverlayGeometry);
  } catch (error) {
    console.error("[ChLens] コメントOverlayのgeometry解析に失敗しました:", error);
    return null;
  }
}

export function loadStoredCommentOverlayGeometry(): CommentOverlayGeometry | null {
  try {
    return parseCommentOverlayGeometry(
      globalThis.localStorage.getItem(COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY),
    );
  } catch (error) {
    console.error("[ChLens] コメントOverlayのgeometry読み込みに失敗しました:", error);
    return null;
  }
}

export function saveStoredCommentOverlayGeometry(geometry: CommentOverlayGeometry): void {
  try {
    globalThis.localStorage.setItem(
      COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify(normalizeCommentOverlayGeometry(geometry)),
    );
  } catch (error) {
    console.error("[ChLens] コメントOverlayのgeometry保存に失敗しました:", error);
  }
}

export function cloneCommentOverlayGeometry(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  return { ...geometry };
}

/** リサイズ開始時の縦横比を保ち、操作した辺の反対側を動かさずに寸法を補正する。 */
export function constrainCommentOverlayGeometryToAspectRatio(
  origin: CommentOverlayGeometry,
  resized: CommentOverlayGeometry,
  direction: CommentOverlayResizeDirection,
): CommentOverlayGeometry {
  // 変更理由: EdgeLiveViewerは保存済みの一時的な縦横比ではなく16:9を基準にするため、
  // 旧版で保存された900x160のgeometryを次回起動時にそのまま再利用しない。
  const aspectRatio = COMMENT_OVERLAY_ASPECT_RATIO;
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
  return normalizeCommentOverlayGeometry({ x, y, width, height });
}

/** 保存済みgeometryを16:9へ移行し、既存の左上位置は変えずに操作領域を保つ。 */
export function fitCommentOverlayGeometryToAspectRatio(
  geometry: CommentOverlayGeometry,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  // 変更理由: 保存値の高さは旧版の900x240など一時的な比率を含むため、対角リサイズの
  // 軸判定へ渡すと高さ側を基準に320x180まで縮む。移行時は幅を基準に16:9へ揃え、
  // ユーザーが保存した表示サイズを小さくしない。
  return normalizeCommentOverlayGeometry({
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.width / COMMENT_OVERLAY_ASPECT_RATIO,
  });
}

export function fallbackCommentOverlayGeometry(
  geometry: CommentOverlayGeometry | null,
): CommentOverlayGeometry {
  // 変更理由: native windowへ直接渡すgeometryも、保存値と同じ最小サイズ・整数座標へ揃える。
  return normalizeCommentOverlayGeometry(geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY);
}

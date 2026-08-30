import { DEFAULT_COMMENT_OVERLAY_GEOMETRY, type CommentOverlayGeometry } from "./types";

export const COMMENT_OVERLAY_GEOMETRY_STORAGE_KEY = "chlens:comment-overlay-geometry";

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

export function fallbackCommentOverlayGeometry(
  geometry: CommentOverlayGeometry | null,
): CommentOverlayGeometry {
  // 変更理由: native windowへ直接渡すgeometryも、保存値と同じ最小サイズ・整数座標へ揃える。
  return normalizeCommentOverlayGeometry(geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY);
}

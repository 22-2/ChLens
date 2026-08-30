import { container } from "src/service-container/index";
import {
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  normalizeCommentOverlaySettings,
  type CommentOverlaySettings,
} from "../domain";

const COMMENT_OVERLAY_CONFIG_KEYS = {
  baseSpeedPxPerSecond: "comment_overlay_speed",
  fontSize: "comment_overlay_font_size",
  opacity: "comment_overlay_opacity",
  maxQueueSize: "comment_overlay_max_queue",
} as const;

function readNumber(key: string, fallback: number): number {
  const raw = container.config.get(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** 既存Configの文字列設定をOverlay domainの値へ変換し、開始時に一度だけ読み込む。 */
export function readCommentOverlaySettings(): CommentOverlaySettings {
  try {
    return normalizeCommentOverlaySettings({
      baseSpeedPxPerSecond: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.baseSpeedPxPerSecond,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.baseSpeedPxPerSecond,
      ),
      fontSize: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.fontSize,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.fontSize,
      ),
      opacity: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.opacity,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.opacity,
      ),
      maxQueueSize: readNumber(
        COMMENT_OVERLAY_CONFIG_KEYS.maxQueueSize,
        DEFAULT_COMMENT_OVERLAY_SETTINGS.maxQueueSize,
      ),
    });
  } catch (error: unknown) {
    console.error("[ChLens] コメントOverlay設定の読み込みに失敗しました:", error);
    return { ...DEFAULT_COMMENT_OVERLAY_SETTINGS };
  }
}

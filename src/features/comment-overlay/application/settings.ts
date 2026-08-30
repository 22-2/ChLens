import { container } from "src/service-container/index";
import { isTauriRuntime } from "src/app/platform/runtime";
import {
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  normalizeCommentOverlaySettings,
  type CommentOverlaySettings,
} from "../domain";

export const COMMENT_OVERLAY_CONFIG_KEYS = {
  baseSpeedPxPerSecond: "comment_overlay_speed",
  fontSize: "comment_overlay_font_size",
  opacity: "comment_overlay_opacity",
  maxQueueSize: "comment_overlay_max_queue",
} as const;

const COMMENT_OVERLAY_CONFIG_KEY_SET = new Set<string>(Object.values(COMMENT_OVERLAY_CONFIG_KEYS));

export function isCommentOverlayConfigKey(key: string | undefined): boolean {
  return key != null && COMMENT_OVERLAY_CONFIG_KEY_SET.has(key);
}

function readNumber(key: string, fallback: number): number {
  const raw = container.config.get(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** 既存Configの文字列設定をOverlay domainの値へ変換し、開始時と更新event時に読み込む。 */
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

export function subscribeToCommentOverlaySettings(listener: () => void): () => void {
  if (!isTauriRuntime()) return () => {};

  const handleConfigUpdated = ({ key }: { key?: string }): void => {
    if (isCommentOverlayConfigKey(key)) listener();
  };

  try {
    container.message.on("config_updated", handleConfigUpdated);
    return () => container.message.off("config_updated", handleConfigUpdated);
  } catch (error: unknown) {
    console.error("[ChLens] コメントOverlay設定の変更監視に失敗しました:", error);
    return () => {};
  }
}

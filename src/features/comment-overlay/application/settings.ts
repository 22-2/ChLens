import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container/index";

import {
  type CommentOverlaySettings,
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  normalizeCommentOverlaySettings,
} from "../domain";

const logger = createLogger("comment-overlay");

// 変更理由: 設定画面に残すのは分裂スレ取得と、コメント・画像それぞれの不透明度だけで、他の値は既定値へ固定して保存値を読まない。
// 不透明度は設定画面のスライダーに合わせ、10から100のパーセントで保存する。
export const COMMENT_OVERLAY_CONFIG_KEYS = {
  commentOpacity: "comment_overlay_comment_opacity",
  imageOpacity: "comment_overlay_image_opacity",
  fetchAllCandidateThreads: "comment_overlay_fetch_all_threads",
} as const;

const COMMENT_OVERLAY_CONFIG_KEY_SET = new Set<string>(Object.values(COMMENT_OVERLAY_CONFIG_KEYS));

export function isCommentOverlayConfigKey(key: string | undefined): boolean {
  return key != null && COMMENT_OVERLAY_CONFIG_KEY_SET.has(key);
}

/** 保存されたパーセント値を0から1の不透明度へ変換する。未設定や不正値はundefinedとして既定値へ任せる。 */
function readOpacity(key: string): number | undefined {
  const raw = container.config.get(key);
  if (raw == null || raw === "") return undefined;
  const percent = Number(raw);
  return Number.isFinite(percent) ? percent / 100 : undefined;
}

/** Configの分裂スレ取得設定と不透明度をOverlay domainの値へ変換し、開始時と更新event時に読み込む。 */
export function readCommentOverlaySettings(): CommentOverlaySettings {
  try {
    return normalizeCommentOverlaySettings({
      ...DEFAULT_COMMENT_OVERLAY_SETTINGS,
      commentOpacity: readOpacity(COMMENT_OVERLAY_CONFIG_KEYS.commentOpacity),
      imageOpacity: readOpacity(COMMENT_OVERLAY_CONFIG_KEYS.imageOpacity),
      fetchAllCandidateThreads:
        container.config.get(COMMENT_OVERLAY_CONFIG_KEYS.fetchAllCandidateThreads) === "on",
    });
  } catch (error: unknown) {
    logger.error("コメントOverlay設定の読み込みに失敗しました:", error);
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
    logger.error("コメントOverlay設定の変更監視に失敗しました:", error);
    return () => {};
  }
}

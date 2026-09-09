import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { COMMENT_OVERLAY_FONT_SIZE } from "src/features/comment-overlay/ui/OverlayStage";

export type ShadowDirection = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface EdgeLiveViewerSettings {
  fontFamily: string;
  fontWeight: number;
  fontColor: string;
  shadowSize: number;
  shadowColor: string;
  shadowDirections: readonly ShadowDirection[];
  durationSeconds: number;
  displayPosition: "top" | "bottom";
  maxComments: number;
  spacing: number;
  opacity: number;
  opaqueBackground: boolean;
  chromaKeyColor: string;
  updateIntervalSeconds: number;
  commentDelaySeconds: number;
  playbackSpeed: number;
  autoNextThread: boolean;
  hideAnchors: boolean;
  hideUrls: boolean;
  ngIds: readonly string[];
  ngNames: readonly string[];
  ngTexts: readonly string[];
}

export const DEFAULT_EDGE_LIVE_VIEWER_SETTINGS: Readonly<EdgeLiveViewerSettings> = {
  fontFamily: "MS PGothic",
  fontWeight: 750,
  fontColor: "#ffffff",
  shadowSize: 2,
  shadowColor: "#000000",
  shadowDirections: ["bottom-right"],
  durationSeconds: 6,
  displayPosition: "top",
  maxComments: 80,
  spacing: 30,
  opacity: 0.8,
  opaqueBackground: false,
  chromaKeyColor: "#00ff00",
  updateIntervalSeconds: 5,
  commentDelaySeconds: 0,
  playbackSpeed: 1,
  autoNextThread: true,
  hideAnchors: false,
  hideUrls: false,
  ngIds: [],
  ngNames: [],
  ngTexts: [],
};

/** EdgeLiveViewerと同じく、固定文字サイズの実高へ表示上の行間を足して各laneを分離する。 */
export function calculateEdgeLiveViewerLaneHeight(spacing: number): number {
  // 変更理由: 文字サイズを設定値から分離し、Live版だけ異なる基準値でlaneを
  // 計算して実機のコメントが重なる再発を防ぐ。
  return Math.max(1, Math.ceil(COMMENT_OVERLAY_FONT_SIZE * 1.2 + spacing));
}

/** EdgeLiveViewerと同じく、ID・名前は完全一致、本文は部分一致でNG判定する。 */
export function filterEdgeLiveViewerComments(
  comments: readonly CommentCandidate[],
  settings: EdgeLiveViewerSettings,
): readonly CommentCandidate[] {
  return comments.filter((comment) => {
    if (settings.hideAnchors && /(?:>>|＞＞)\d+/.test(comment.text)) return false;
    if (settings.hideUrls && /https?:\/\//i.test(comment.text)) return false;
    if (comment.id && settings.ngIds.includes(comment.id)) return false;
    if (settings.ngNames.includes(comment.author)) return false;
    return !settings.ngTexts.some((text) => text !== "" && comment.text.includes(text));
  });
}

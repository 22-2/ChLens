export const REPLY_HEAT_WARM_THRESHOLD = 3;
export const REPLY_HEAT_HOT_THRESHOLD = 5;

export type ReplyHeatLevel = "none" | "warm" | "hot";

/**
 * 返信数に応じた強調レベルを統一して、レス番号/返信ラベルで同じ基準を使えるようにする。
 */
export function getReplyHeatLevel(repCount: number): ReplyHeatLevel {
  if (repCount >= REPLY_HEAT_HOT_THRESHOLD) {
    return "hot";
  }
  if (repCount >= REPLY_HEAT_WARM_THRESHOLD) {
    return "warm";
  }
  return "none";
}

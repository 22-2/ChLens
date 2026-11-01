import type { INGResult } from "src/core/ports/ng";

/** ルールに名前（label）がないときの理由の名前。類似画像NGの登録で付く既定の名前と同じ。 */
const DEFAULT_RULE_LABEL = "類似画像";

/** 類似画像NG（blur）の結果を、画像にかざしたときに出す理由の文言にする。 */
export function formatSimilarImageBlurReason(result: INGResult): string {
  const label = result.params?.label?.trim();
  return `NGルール: ${label || DEFAULT_RULE_LABEL}`;
}

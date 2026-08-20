import type { INGResult } from "src/service-container";

/** NGバッヂのツールチップ文言。判定種別だけでなく、実際に一致したDSL条件を優先する。 */
export function getNgBadgeLabel(result: INGResult | undefined): string {
  if (result == null) return "NG（ルール情報なし）";

  const ruleDescription = result.ruleDescription?.trim();
  if (ruleDescription) return `NGルール\n${ruleDescription}`;

  const ruleName = result.name?.trim();
  const presentationLabel = result.params?.label?.trim();
  const details = ruleName || presentationLabel || result.type;
  return `NGルール: ${details}`;
}

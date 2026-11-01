import type { INGResult } from "src/service-container";

/**
 * NGバッヂのツールチップ文言。ルールに名前（label）があればそれを理由として先頭に出し、
 * 一致したDSL条件はその次の行に続ける。名前がなければ、従来どおりDSL条件を優先する。
 */
export function getNgBadgeLabel(result: INGResult | undefined): string {
  if (result == null) return "NG（ルール情報なし）";

  const ruleDescription = result.ruleDescription?.trim();
  const presentationLabel = result.params?.label?.trim();
  if (presentationLabel) {
    return ruleDescription
      ? `NGルール: ${presentationLabel}\n${ruleDescription}`
      : `NGルール: ${presentationLabel}`;
  }
  if (ruleDescription) return `NGルール\n${ruleDescription}`;

  const ruleName = result.name?.trim();
  const details = ruleName || result.type;
  return `NGルール: ${details}`;
}

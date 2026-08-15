import type { RuleAction, RuleTarget } from "src/core/rules/model";

export interface RuleCatalogEntry<T extends string> {
  readonly name: T;
  readonly aliases?: readonly string[];
  readonly description: string;
}

export const RULE_ACTION_CATALOG: readonly RuleCatalogEntry<RuleAction>[] = [
  { name: "hide", aliases: ["ng"], description: "一致した対象を非表示にします。" },
  { name: "highlight", description: "一致した対象を強調します。" },
  { name: "mute", description: "一致した対象を目立たなくします。" },
  { name: "warn", description: "一致した対象に警告を表示します。" },
];

export const RULE_TARGET_CATALOG: readonly RuleCatalogEntry<RuleTarget>[] = [
  { name: "all", description: "対象の全文" },
  { name: "title", description: "スレッドタイトル" },
  { name: "body", description: "レス本文" },
  { name: "name", description: "名前欄" },
  { name: "mail", description: "メール欄" },
  { name: "id", description: "投稿者ID" },
  { name: "slip", description: "SLIP" },
  { name: "url", description: "URL" },
  { name: "res-count", aliases: ["res_count"], description: "スレッドのレス数" },
  { name: "reply-count", aliases: ["reply_count"], description: "レスへの返信数" },
];

export const RULE_OPTION_CATALOG: readonly RuleCatalogEntry<string>[] = [
  { name: "sites", description: "適用するサイトまたは板" },
  { name: "color", aliases: ["bgColor"], description: "強調表示の背景色" },
  { name: "label", description: "表示するラベル" },
  { name: "disabled", description: "ルールを一時的に無効化" },
];

function normalizeFromCatalog<T extends string>(
  value: string,
  catalog: readonly RuleCatalogEntry<T>[],
): T | null {
  const normalized = value.trim().toLowerCase();
  for (const entry of catalog) {
    if (
      entry.name === normalized ||
      entry.aliases?.some((alias) => alias.toLowerCase() === normalized)
    ) {
      return entry.name;
    }
  }
  return null;
}

export function normalizeRuleAction(value: string): RuleAction | null {
  return normalizeFromCatalog(value, RULE_ACTION_CATALOG);
}

export function normalizeRuleTarget(value: string): RuleTarget | null {
  return normalizeFromCatalog(value, RULE_TARGET_CATALOG);
}

/** 現在UIまで実装済みの組み合わせ。mute/warnは将来拡張用の予約語として保持する。 */
export function isRuleCombinationSupported(action: RuleAction, target: RuleTarget): boolean {
  return action === "hide" || (action === "highlight" && target === "title");
}

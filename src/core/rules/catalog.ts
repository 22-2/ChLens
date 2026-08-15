import type { RuleAction, RuleTarget } from "src/core/rules/model";

export interface RuleCatalogEntry<T extends string> {
  readonly name: T;
  readonly aliases?: readonly string[];
  readonly description: string;
}

export type RuleTargetField =
  | "all"
  | "title"
  | "body"
  | "name"
  | "mail"
  | "id"
  | "slip"
  | "url"
  | "resCount"
  | "replyCount";
export type RuleTargetComparison =
  | "contains"
  | "url-contains"
  | "greater-than"
  | "greater-than-or-equal";

export interface RuleTargetDefinition extends RuleCatalogEntry<RuleTarget> {
  readonly field: RuleTargetField;
  readonly comparison: RuleTargetComparison;
  readonly legacyTypes: readonly [contains: string, regex: string];
  readonly legacyHighlightTypes?: readonly [contains: string, regex: string];
  readonly allowedOnBoard: boolean;
  readonly allowedOnThread: boolean;
}

export const RULE_ACTION_CATALOG: readonly RuleCatalogEntry<RuleAction>[] = [
  { name: "hide", aliases: ["ng"], description: "一致した対象を非表示にします。" },
  { name: "highlight", description: "一致した対象を強調します。" },
  { name: "mute", description: "一致した対象を目立たなくします。" },
  { name: "warn", description: "一致した対象に警告を表示します。" },
];

/** DSL名と判定対象の対応を一箇所に集約する。 */
export const RULE_TARGET_DEFINITIONS: Readonly<Record<RuleTarget, RuleTargetDefinition>> = {
  all: {
    name: "all",
    description: "対象の全文",
    field: "all",
    comparison: "contains",
    legacyTypes: ["Word", "RegExp"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  title: {
    name: "title",
    description: "スレッドタイトル",
    field: "title",
    comparison: "contains",
    legacyTypes: ["Title", "RegExpTitle"],
    legacyHighlightTypes: ["HighlightTitle", "RegExpHighlightTitle"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  body: {
    name: "body",
    description: "レス本文",
    field: "body",
    comparison: "contains",
    legacyTypes: ["Body", "RegExpBody"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  name: {
    name: "name",
    description: "名前欄",
    field: "name",
    comparison: "contains",
    legacyTypes: ["Name", "RegExpName"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  mail: {
    name: "mail",
    description: "メール欄",
    field: "mail",
    comparison: "contains",
    legacyTypes: ["Mail", "RegExpMail"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  id: {
    name: "id",
    description: "投稿者ID",
    field: "id",
    comparison: "contains",
    legacyTypes: ["ID", "RegExpId"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  slip: {
    name: "slip",
    description: "SLIP",
    field: "slip",
    comparison: "contains",
    legacyTypes: ["Slip", "RegExpSlip"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  url: {
    name: "url",
    description: "URL",
    field: "url",
    comparison: "url-contains",
    legacyTypes: ["Url", "RegExpUrl"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  "res-count": {
    name: "res-count",
    aliases: ["res_count"],
    description: "スレッドのレス数",
    field: "resCount",
    comparison: "greater-than",
    legacyTypes: ["ResCount", "ResCount"],
    allowedOnBoard: true,
    allowedOnThread: false,
  },
  "reply-count": {
    name: "reply-count",
    aliases: ["reply_count"],
    description: "レスへの返信数",
    field: "replyCount",
    comparison: "greater-than-or-equal",
    legacyTypes: ["ReplyCount", "ReplyCount"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
};

export const RULE_TARGET_CATALOG: readonly RuleTargetDefinition[] =
  Object.values(RULE_TARGET_DEFINITIONS);

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

export function getRuleTargetDefinition(target: RuleTarget): RuleTargetDefinition {
  return RULE_TARGET_DEFINITIONS[target];
}

/** 現在UIまで実装済みの組み合わせ。mute/warnは将来拡張用の予約語として保持する。 */
export function isRuleCombinationSupported(action: RuleAction, target: RuleTarget): boolean {
  return action === "hide" || (action === "highlight" && target === "title");
}

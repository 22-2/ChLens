import type { RuleAction, RuleTarget } from "./model";

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
  | "replyCount"
  | "anchorCount"
  // 類似画像は同期テキスト判定へ渡さず、表示付近の非同期画像判定でだけ利用する。
  | "similarImage";
export type RuleTargetComparison =
  | "contains"
  | "url-contains"
  | "greater-than"
  | "greater-than-or-equal";

export interface RuleTargetDefinition extends RuleCatalogEntry<RuleTarget> {
  readonly field: RuleTargetField;
  readonly comparison: RuleTargetComparison;
  readonly resultTypes: readonly [contains: string, regex: string];
  readonly highlightResultTypes?: readonly [contains: string, regex: string];
  readonly allowedOnBoard: boolean;
  readonly allowedOnThread: boolean;
}

export const RULE_ACTION_CATALOG: readonly RuleCatalogEntry<RuleAction>[] = [
  { name: "hide", description: "一致した対象を非表示にします。" },
  // 画像ハッシュ判定は既存サムネイルの表示経路へ合流させるため、動作はblurに限定する。
  { name: "blur", description: "一致した画像のサムネイルをぼかします。" },
  { name: "highlight", description: "一致した対象を強調します。" },
  {
    name: "demote",
    description: "一致した対象を一覧の末尾へ移動し、目立たなくします。",
  },
  { name: "warn", description: "一致した対象に警告を表示します。" },
];

/** DSL名と判定対象の対応を一箇所に集約する。 */
export const RULE_TARGET_DEFINITIONS: Readonly<Record<RuleTarget, RuleTargetDefinition>> = {
  all: {
    name: "all",
    description: "対象の全文",
    field: "all",
    comparison: "contains",
    resultTypes: ["Word", "RegExp"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  title: {
    name: "title",
    description: "スレッドタイトル",
    field: "title",
    comparison: "contains",
    resultTypes: ["Title", "RegExpTitle"],
    highlightResultTypes: ["HighlightTitle", "RegExpHighlightTitle"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  body: {
    name: "body",
    description: "レス本文",
    field: "body",
    comparison: "contains",
    resultTypes: ["Body", "RegExpBody"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  name: {
    name: "name",
    description: "名前欄",
    field: "name",
    comparison: "contains",
    resultTypes: ["Name", "RegExpName"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  mail: {
    name: "mail",
    description: "メール欄",
    field: "mail",
    comparison: "contains",
    resultTypes: ["Mail", "RegExpMail"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  id: {
    name: "id",
    description: "投稿者ID",
    field: "id",
    comparison: "contains",
    resultTypes: ["ID", "RegExpId"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  slip: {
    name: "slip",
    description: "SLIP",
    field: "slip",
    comparison: "contains",
    resultTypes: ["Slip", "RegExpSlip"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  url: {
    name: "url",
    description: "URL",
    field: "url",
    comparison: "url-contains",
    resultTypes: ["Url", "RegExpUrl"],
    allowedOnBoard: true,
    allowedOnThread: true,
  },
  "res-count": {
    name: "res-count",
    description: "スレッドのレス数",
    field: "resCount",
    comparison: "greater-than-or-equal",
    resultTypes: ["ResCount", "ResCount"],
    allowedOnBoard: true,
    allowedOnThread: false,
  },
  "reply-count": {
    name: "reply-count",
    description: "レスへの返信数",
    field: "replyCount",
    comparison: "greater-than-or-equal",
    resultTypes: ["ReplyCount", "ReplyCount"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  "anchor-count": {
    name: "anchor-count",
    description: "レスが参照するレス先の数",
    field: "anchorCount",
    comparison: "greater-than-or-equal",
    resultTypes: ["AnchorCount", "AnchorCount"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
  "similar-image": {
    // ハッシュ比較はレス本文の同期マッチャーと異なるため、スレッド専用の対象として定義する。
    name: "similar-image",
    aliases: ["SimilarImage"],
    description: "dHashが似ている画像",
    field: "similarImage",
    comparison: "contains",
    resultTypes: ["SimilarImage", "SimilarImage"],
    allowedOnBoard: false,
    allowedOnThread: true,
  },
};

export const RULE_TARGET_CATALOG: readonly RuleTargetDefinition[] =
  Object.values(RULE_TARGET_DEFINITIONS);

export const RULE_OPTION_CATALOG: readonly RuleCatalogEntry<string>[] = [
  { name: "sites", description: "適用するサイトまたは板" },
  { name: "color", description: "強調表示の背景色" },
  { name: "label", description: "表示するラベル" },
  { name: "threshold", description: "類似画像判定で許容するハミング距離" },
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

export function normalizeRuleOption(value: string): string | null {
  return normalizeFromCatalog(value, RULE_OPTION_CATALOG);
}

export function getRuleTargetDefinition(target: RuleTarget): RuleTargetDefinition {
  return RULE_TARGET_DEFINITIONS[target];
}

/** 現在UIまで実装済みの組み合わせ。warnは将来拡張用の予約語として保持する。 */
export function isRuleCombinationSupported(action: RuleAction, target: RuleTarget): boolean {
  return (
    (action === "blur" && target === "similar-image") ||
    (action === "hide" && target !== "similar-image") ||
    (action === "demote" && target !== "similar-image") ||
    (action === "highlight" && target === "title")
  );
}

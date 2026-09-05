export const RULE_ACTIONS = ["hide", "highlight", "demote", "warn"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_TARGETS = [
  "all",
  "title",
  "body",
  "name",
  "mail",
  "id",
  "slip",
  "url",
  "res-count",
  "reply-count",
  "anchor-count",
] as const;
export type RuleTarget = (typeof RULE_TARGETS)[number];

export type RuleMatcher =
  | { readonly kind: "contains"; readonly value: string }
  | { readonly kind: "regex"; readonly source: string; readonly flags?: string };

export interface RuleScope {
  readonly sites?: readonly string[];
}

export interface RulePresentation {
  readonly color?: string;
  readonly label?: string;
}

export interface RuleCondition {
  readonly target: RuleTarget;
  readonly matchers: readonly RuleMatcher[];
}

/** DSLの表記方法に依存しない、判定エンジン向けのルール表現。 */
export interface Rule {
  readonly action: RuleAction;
  readonly target: RuleTarget;
  readonly matchers: readonly RuleMatcher[];
  /** 既存のtarget/matchersに追加して、すべてANDで満たす条件。 */
  readonly conditions?: readonly RuleCondition[];
  readonly scope?: RuleScope;
  readonly presentation?: RulePresentation;
  readonly enabled: boolean;
  readonly expiresAt?: number;
  readonly name?: string;
}

/** 旧形式の単一条件と新形式の追加AND条件を同じ順序で評価する。 */
export function getRuleConditions(rule: Rule): readonly RuleCondition[] {
  return [{ target: rule.target, matchers: rule.matchers }, ...(rule.conditions ?? [])];
}

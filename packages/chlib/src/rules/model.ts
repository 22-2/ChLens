export const RULE_ACTIONS = ["hide", "collapse", "highlight", "warn"] as const;
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
  /** unlessは条件内のOR全体を否定する。 */
  readonly negate?: boolean;
  readonly comparison?: ">" | ">=";
}

/** DSLの表記方法に依存しない、判定エンジン向けのルール表現。 */
export interface Rule {
  readonly action: RuleAction;
  readonly target: RuleTarget;
  readonly matchers: readonly RuleMatcher[];
  readonly negate?: boolean;
  readonly comparison?: ">" | ">=";
  /** 既存のtarget/matchersに追加して、すべてANDで満たす条件。 */
  readonly conditions?: readonly RuleCondition[];
  readonly scope?: RuleScope;
  readonly presentation?: RulePresentation;
  readonly enabled: boolean;
  readonly expiresAt?: number;
  readonly name?: string;
}

/** 表示結果の種別を持つ条件も、追加条件と同じANDの一要素として評価する。 */
export function getRuleConditions(rule: Rule): readonly RuleCondition[] {
  return [
    {
      target: rule.target,
      matchers: rule.matchers,
      ...(rule.negate ? { negate: true } : {}),
      ...(rule.comparison ? { comparison: rule.comparison } : {}),
    },
    ...(rule.conditions ?? []),
  ];
}

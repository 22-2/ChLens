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

/** DSLの表記方法に依存しない、判定エンジン向けのルール表現。 */
export interface Rule {
  readonly action: RuleAction;
  readonly target: RuleTarget;
  readonly matchers: readonly RuleMatcher[];
  readonly scope?: RuleScope;
  readonly presentation?: RulePresentation;
  readonly enabled: boolean;
  readonly expiresAt?: number;
  readonly name?: string;
}

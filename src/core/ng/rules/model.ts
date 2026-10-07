// 既存のsrc/core importを壊さず、実装本体だけをworkspace packageへ集約するcompatibility facade。
export type {
  Rule,
  RuleAction,
  RuleCondition,
  RuleMatcher,
  RulePresentation,
  RuleScope,
  RuleTarget,
} from "@chlen/chlib";
export { RULE_ACTIONS, RULE_TARGETS } from "@chlen/chlib";
export { getRuleConditions } from "@chlen/chlib";

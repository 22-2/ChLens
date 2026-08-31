// 既存のsrc/core importを壊さず、実装本体だけをworkspace packageへ集約するcompatibility facade。
export { RULE_ACTIONS, RULE_TARGETS } from "@chlen/ch-lib";
export type {
  Rule,
  RuleAction,
  RuleMatcher,
  RulePresentation,
  RuleScope,
  RuleTarget,
} from "@chlen/ch-lib";

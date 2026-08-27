// 既存のsrc/core importを維持するための薄いfacade。catalogの定義はch-libを正とする。
export {
  getRuleTargetDefinition,
  isRuleCombinationSupported,
  normalizeRuleAction,
  normalizeRuleOption,
  normalizeRuleTarget,
  RULE_ACTION_CATALOG,
  RULE_OPTION_CATALOG,
  RULE_TARGET_CATALOG,
  RULE_TARGET_DEFINITIONS,
} from "@chlen/ch-lib";
export type {
  RuleCatalogEntry,
  RuleTargetComparison,
  RuleTargetDefinition,
  RuleTargetField,
} from "@chlen/ch-lib";

// 既存のsrc/core importを維持するための薄いfacade。catalogの定義はchlibを正とする。
export type {
  RuleCatalogEntry,
  RuleTargetComparison,
  RuleTargetDefinition,
  RuleTargetField,
} from "@chlen/chlib";
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
} from "@chlen/chlib";

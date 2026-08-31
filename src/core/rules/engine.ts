// 評価器の実装を二重管理しないため、既存import向けにch-libのAPIを再公開する。
export {
  BOARD_RULE_ACTIONS,
  BOARD_RULE_TARGETS,
  clearRuleRegexCache,
  evaluateBoardRules,
  evaluateResponseRules,
  evaluateThreadListRules,
  matchRules,
  RESPONSE_RULE_ACTIONS,
  RESPONSE_RULE_TARGETS,
  THREAD_LIST_RULE_ACTIONS,
  THREAD_LIST_RULE_TARGETS,
} from "@chlen/ch-lib";
export type {
  BoardRuleContext,
  ResponseRuleContext,
  RuleMatchContext,
  RuleMatchResult,
  ThreadListRuleContext,
} from "@chlen/ch-lib";

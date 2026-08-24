// 設定画面の既存importを維持しつつ、DSL editor向けの定義を共有packageから利用する。
export {
  NG_DSL_LANGUAGE_ID,
  NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS,
  NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
  NG_HIGHLIGHT_COLOR_PRESETS,
  RULE_DSL_COMPLETION_CANDIDATES,
  RULE_DSL_LANGUAGE_DEFINITION,
  stringifyNgDslValue,
} from "@chlen/ch-lib";
export type {
  NgDslColorPresetName,
  RuleDslCompletionCandidate,
  RuleDslCompletionCategory,
} from "@chlen/ch-lib";

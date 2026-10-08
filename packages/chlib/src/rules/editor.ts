import {
  isRuleCombinationSupported,
  RULE_ACTION_CATALOG,
  RULE_OPTION_CATALOG,
  RULE_TARGET_CATALOG,
} from "./catalog";
import { quoteRuleDslValue } from "./dsl";

export const NG_DSL_LANGUAGE_ID = "chlens-ngdsl";

export const NG_HIGHLIGHT_COLOR_PRESETS = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
} as const;

export const NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS = {
  yellow: "黄色 (警告・注目)",
  blue: "青 (情報)",
  green: "緑 (成功・OK)",
  red: "赤 (重要・緊急)",
  purple: "紫 (特別)",
  orange: "オレンジ (注意)",
  pink: "ピンク (お気に入り)",
  cyan: "シアン (クール)",
  lime: "ライム (軽い注目)",
  amber: "アンバー (中程度の注意)",
} as const;

export type NgDslColorPresetName = keyof typeof NG_HIGHLIGHT_COLOR_PRESETS;

export const NG_HIGHLIGHT_COLOR_PRESET_ITEMS = Object.entries(NG_HIGHLIGHT_COLOR_PRESETS).map(
  ([name, hex]) => ({
    name: name as NgDslColorPresetName,
    hex,
    description:
      NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS[
        name as keyof typeof NG_HIGHLIGHT_COLOR_PRESET_DESCRIPTIONS
      ],
  }),
);

export const RULE_DSL_LANGUAGE_DEFINITION = {
  actions: RULE_ACTION_CATALOG,
  targets: RULE_TARGET_CATALOG,
  options: RULE_OPTION_CATALOG,
  operators: ["when", "unless"] as const,
  matchers: ["contains", "regex"] as const,
  colors: NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
} as const;

export type RuleDslCompletionCategory = "header" | "condition" | "option" | "color" | "regex-value";

export interface RuleDslCompletionCandidate {
  readonly category: RuleDslCompletionCategory;
  readonly label: string;
  readonly detail: string;
  readonly insertText: string;
  readonly isSnippet?: boolean;
}

/** 補完の本文も設定保存と同じ、動作・条件・設定の分離形式を使う。 */
export const RULE_DSL_COMPLETION_CANDIDATES: readonly RuleDslCompletionCandidate[] = [
  ...RULE_ACTION_CATALOG.filter(({ name }) => name !== "warn").flatMap((action) =>
    RULE_TARGET_CATALOG.filter((target) =>
      isRuleCombinationSupported(action.name, target.name),
    ).map((target): RuleDslCompletionCandidate => {
      const numeric = target.field.endsWith("Count");
      return {
        category: "header",
        label: `${action.name} (${target.name})`,
        detail: `${action.description} 対象: ${target.description}`,
        insertText: `${action.name}:\n  when ${target.name} ${numeric ? ">= ${1:10}" : 'contains "${1:キーワード}"'}`,
        isSnippet: true,
      };
    }),
  ),
  ...(["when", "unless"] as const).flatMap((keyword) =>
    RULE_TARGET_CATALOG.flatMap((target) => {
      const numeric = target.field.endsWith("Count");
      return (numeric ? [">="] : ["contains", "regex"]).map(
        (operator): RuleDslCompletionCandidate => ({
          category: "condition",
          label: `${keyword} ${target.name} ${operator}`,
          detail: `${target.description}の${keyword === "unless" ? "除外" : "一致"}条件を追加します。`,
          insertText: `${keyword} ${target.name} ${operator} ${numeric ? "${1:10}" : '"${1:値}"'}`,
          isSnippet: true,
        }),
      );
    }),
  ),
  ...RULE_OPTION_CATALOG.map((option): RuleDslCompletionCandidate => ({
    category: "option",
    label: option.name,
    detail: option.description,
    insertText:
      option.name === "color"
        ? "color ${1:blue}"
        : option.name === "disabled"
          ? "disabled ${1:true}"
          : `${option.name} "\${1:値}"`,
    isSnippet: true,
  })),
  ...NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map((preset): RuleDslCompletionCandidate => ({
    category: "color",
    label: preset.name,
    detail: `${preset.hex} / ${preset.description}`,
    insertText: preset.name,
  })),
  {
    category: "color",
    label: "#rrggbb",
    detail: "16進カラーコード",
    insertText: "#${1:ffcdd2}",
    isSnippet: true,
  },
  {
    category: "regex-value",
    label: "regex value",
    detail: "正規表現の引用値",
    insertText: '"${1:パターン}"',
    isSnippet: true,
  },
];

/** 1行の文字列値は常に引用し、手入力とNG追加で記号の扱いを揃える。 */
export function stringifyNgDslValue(value: string): string {
  return quoteRuleDslValue(value);
}

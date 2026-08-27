import {
  isRuleCombinationSupported,
  RULE_ACTION_CATALOG,
  RULE_OPTION_CATALOG,
  RULE_TARGET_CATALOG,
} from "./catalog";

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
  matchers: ["contains", "regex"] as const,
  colors: NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
} as const;

export type RuleDslCompletionCategory = "header" | "option" | "color" | "regex-value";

export interface RuleDslCompletionCandidate {
  readonly category: RuleDslCompletionCategory;
  readonly label: string;
  readonly detail: string;
  readonly insertText: string;
  readonly isSnippet?: boolean;
}

/** Monacoの型を共有層へ持ち込まず、各editor adapterが変換できる補完候補を公開する。 */
export const RULE_DSL_COMPLETION_CANDIDATES: readonly RuleDslCompletionCandidate[] = [
  ...RULE_ACTION_CATALOG.flatMap((action) =>
    RULE_TARGET_CATALOG.filter((target) =>
      isRuleCombinationSupported(action.name, target.name),
    ).flatMap((target) => {
      const isComparison =
        target.comparison === "greater-than" || target.comparison === "greater-than-or-equal";
      const matcherKinds = isComparison ? ["comparison"] : ["contains", "regex"];
      return matcherKinds.map(
        (matcherKind): RuleDslCompletionCandidate => ({
          category: "header",
          label:
            matcherKind === "comparison"
              ? `${action.name} ${target.name} >=`
              : `${action.name} ${target.name} ${matcherKind}`,
          detail: `${action.description} 対象: ${target.description}`,
          insertText:
            matcherKind === "comparison"
              ? `${action.name} ${target.name} ${target.comparison === "greater-than" ? ">" : ">="} \${1:10}:`
              : matcherKind === "regex"
                ? `${action.name} ${target.name} regex:\n  "\${1:パターン}"`
                : `${action.name} ${target.name} contains:\n  \${1:キーワード}`,
          isSnippet: true,
        }),
      );
    }),
  ),
  ...RULE_OPTION_CATALOG.map(
    (option): RuleDslCompletionCandidate => ({
      category: "option",
      label: option.name,
      detail: option.description,
      insertText: `${option.name}=`,
    }),
  ),
  ...NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map(
    (preset): RuleDslCompletionCandidate => ({
      category: "color",
      label: preset.name,
      detail: `${preset.hex} / ${preset.description}`,
      insertText: preset.name,
    }),
  ),
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

export function stringifyNgDslValue(
  value: string,
  options: { alwaysQuote?: boolean } = {},
): string {
  // 普通の語は読みやすく残し、DSLの記号と衝突する値だけ引用する。
  const trimmed = value.trimStart();
  const couldBeComment =
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/");
  const canBeBare =
    value.length > 0 &&
    !couldBeComment &&
    Array.from(value).every((character) => {
      return !/\s/u.test(character) && !",()[]{}=:'\"".includes(character);
    });
  if (!options.alwaysQuote && canBeBare) return value;
  return JSON.stringify(value);
}

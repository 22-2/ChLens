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

export function stringifyNgDslValue(
  value: string,
  options: { alwaysQuote?: boolean } = {},
): string {
  // Keep ordinary words readable while quoting values that could be parsed as DSL syntax.
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

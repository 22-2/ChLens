/** 基調と配色は独立して選べる。各配色はライトとダークの両方を定義する。 */
export const COLOR_SCHEMES = [
  { id: "default", title: "標準" },
  { id: "midnight", title: "ミッドナイト" },
] as const;

export type ThemeId = "system" | "light" | "dark";
export type ColorSchemeId = (typeof COLOR_SCHEMES)[number]["id"];
export type ResolvedTheme = "light" | "dark";

export function parseThemeId(raw: string | null | undefined): ThemeId {
  if (raw === "default") return "light";
  // 分離前のミッドナイトはダーク基調だった。
  if (raw === "midnight") return "dark";
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function parseColorSchemeId(raw: string | null | undefined): ColorSchemeId {
  return COLOR_SCHEMES.find((scheme) => scheme.id === raw)?.id ?? "default";
}

/** 配色を追加するときは基調を指定し、CSS側で同じIDの意味トークンを定義する。 */
export const THEMES = [
  { id: "light", title: "ライト", scheme: "light" },
  { id: "dark", title: "ダーク", scheme: "dark" },
  { id: "midnight", title: "ミッドナイト", scheme: "dark" },
] as const;

export type ColorScheme = "light" | "dark";
export type ThemeId = (typeof THEMES)[number]["id"] | "system";

export function parseThemeId(raw: string | null | undefined): ThemeId {
  if (raw === "default") return "light";
  return THEMES.find((theme) => theme.id === raw)?.id ?? "system";
}

export function resolveTheme(id: ThemeId, systemScheme: ColorScheme) {
  const theme = THEMES.find((candidate) => candidate.id === id);
  return theme ?? THEMES.find((candidate) => candidate.id === systemScheme)!;
}

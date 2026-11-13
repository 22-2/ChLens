import { parseColorSchemeId, parseThemeId } from "./theme-registry";

// ReactとConfigの起動完了を待たず、初回描画前に保存済みテーマを反映する。
let themeId = null;
let schemeId = null;

try {
  themeId = window.localStorage.getItem("config_theme_id");
  schemeId = window.localStorage.getItem("config_color_scheme_id");
} catch (error) {
  console.error("起動時のテーマ設定を読み込めませんでした:", error);
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const selectedTheme = parseThemeId(themeId);
const theme = selectedTheme === "system" ? (prefersDark ? "dark" : "light") : selectedTheme;
// Configの移行が始まる前も、旧ミッドナイト設定を同じ見た目で表示する。
const scheme = parseColorSchemeId(schemeId ?? (themeId === "midnight" ? "midnight" : null));
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.colorScheme = scheme;
// 属性だけではCSSの読み込みを待つため、ブラウザの初期背景にも保存済みの配色を指定する。
document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme);

import { parseThemeId, resolveTheme } from "./theme-registry";

// ReactとConfigの起動完了を待たず、初回描画前に保存済みテーマを反映する。
let themeId = null;

try {
  themeId = window.localStorage.getItem("config_theme_id");
} catch (error) {
  console.error("起動時のテーマ設定を読み込めませんでした:", error);
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = resolveTheme(parseThemeId(themeId), prefersDark ? "dark" : "light");
document.documentElement.dataset.theme = theme.scheme;
document.documentElement.dataset.themeId = theme.id;
// 属性だけではCSSの読み込みを待つため、ブラウザの初期背景にも保存済みの配色を指定する。
document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme.scheme);

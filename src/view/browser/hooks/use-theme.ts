import { useEffect, useLayoutEffect, useState } from "react";
import { container } from "src/service-container/index";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import {
  type ColorSchemeId,
  parseColorSchemeId,
  parseThemeId,
  type ThemeId,
} from "src/view/browser/theme-registry";

export type ResolvedTheme = "light" | "dark";

function resolveSystemTheme(targetWindow: Window): ResolvedTheme {
  return targetWindow.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** theme_id 設定値を監視し、解決済みの light/dark テーマを返すフック */
export function useTheme(): ResolvedTheme {
  const { window: viewWindow } = useViewSurface();
  const [themeId, setThemeId] = useState<ThemeId>(() =>
    parseThemeId(container.config.get("theme_id")),
  );
  const [colorSchemeId, setColorSchemeId] = useState<ColorSchemeId>(() =>
    parseColorSchemeId(container.config.get("color_scheme_id")),
  );

  // 設定変更を購読し、基調とカラースキームの両方をリアルタイムで反映する。
  useEffect(() => {
    const syncThemeId = () => {
      // Config は localStorage の読み込み後に確定するため、初回レンダー時の既定値だけで
      // テーマを決めると、再起動後に保存済みの dark 設定を取りこぼしてしまう。
      setThemeId(parseThemeId(container.config.get("theme_id")));
      setColorSchemeId(parseColorSchemeId(container.config.get("color_scheme_id")));
    };
    const handleConfigUpdated = ({ key, val }: { key: string; val: string }) => {
      if (key === "theme_id") {
        setThemeId(parseThemeId(val));
      }
      if (key === "color_scheme_id") {
        setColorSchemeId(parseColorSchemeId(val));
      }
    };
    container.config.ready(syncThemeId);
    container.message.on("config_updated", handleConfigUpdated);
    return () => container.message.off("config_updated", handleConfigUpdated);
  }, []);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const id = parseThemeId(container.config.get("theme_id"));
    return id === "system" ? resolveSystemTheme(viewWindow) : id;
  });

  useLayoutEffect(() => {
    // 起動時のルート配色も追従させないと、ライトへ戻してもダーク用トークンが継承される。
    const viewDocument = viewWindow.document;
    viewDocument.documentElement.setAttribute("data-theme", resolved);
    // 基調と独立して配色を変更できるよう、別の属性でCSSへ伝える。
    viewDocument.documentElement.setAttribute("data-color-scheme", colorSchemeId);
    viewDocument.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolved);
  }, [resolved, colorSchemeId, viewWindow]);

  useEffect(() => {
    if (themeId !== "system") {
      setResolved(themeId);
      return;
    }

    // system: prefers-color-scheme の変化を監視する
    const mq = viewWindow.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolved(mq.matches ? "dark" : "light");
    setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [themeId, viewWindow]);

  return resolved;
}

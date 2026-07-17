import { useEffect, useState } from "react";
import { container } from "src/service-container/index";

type ThemeId = "default" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function parseThemeId(raw: string | undefined): ThemeId {
  if (raw === "dark" || raw === "system") return raw;
  // "default" および未知の値はライトとして扱う
  return "default";
}

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** theme_id 設定値を監視し、解決済みの light/dark テーマを返すフック */
export function useTheme(): ResolvedTheme {
  const [themeId, setThemeId] = useState<ThemeId>(() =>
    parseThemeId(container.config.get("theme_id")),
  );

  // config_updated メッセージを購読し、theme_id の変更をリアルタイムで反映する
  useEffect(() => {
    const handleConfigUpdated = ({
      key,
      val,
    }: {
      key: string;
      val: string;
    }) => {
      if (key === "theme_id") {
        setThemeId(parseThemeId(val));
      }
    };
    container.message.on("config_updated", handleConfigUpdated);
    return () => container.message.off("config_updated", handleConfigUpdated);
  }, []);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const id = parseThemeId(container.config.get("theme_id"));
    if (id === "dark") return "dark";
    if (id === "system") return resolveSystemTheme();
    return "light";
  });

  useEffect(() => {
    if (themeId === "dark") {
      setResolved("dark");
      return;
    }
    if (themeId === "default") {
      setResolved("light");
      return;
    }

    // system: prefers-color-scheme の変化を監視する
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolved(mq.matches ? "dark" : "light");
    setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [themeId]);

  return resolved;
}

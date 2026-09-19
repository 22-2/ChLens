import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

export const TITLE_BAR_NAVIGATION_CONFIG_KEY = "title_bar_navigation";

/** タイトルバー左端へ戻る・進むを表示する設定を監視する。 */
export function useTitleBarNavigationEnabled(): boolean {
  const { value: enabled } = useConfigBooleanSetting(TITLE_BAR_NAVIGATION_CONFIG_KEY, true);
  return enabled;
}

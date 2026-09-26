import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

export const TITLE_BAR_BACK_CONFIG_KEY = "title_bar_back";
export const TITLE_BAR_FORWARD_CONFIG_KEY = "title_bar_forward";
export const TITLE_BAR_REFRESH_CONFIG_KEY = "title_bar_refresh";

export interface TitleBarButtonSettings {
  backEnabled: boolean;
  forwardEnabled: boolean;
  refreshEnabled: boolean;
  setBackEnabled: (enabled: boolean) => void;
  setForwardEnabled: (enabled: boolean) => void;
  setRefreshEnabled: (enabled: boolean) => void;
}

/**
 * タイトルバー左端の各ボタンを個別に監視・保存する。
 * 変更理由: 戻る・進むだけでなく更新も利用者が選べるようにし、専用モーダルの表示と
 * タイトルバーの描画が同じ設定値を直接共有できるようにする。
 */
export function useTitleBarButtonSettings(): TitleBarButtonSettings {
  const { value: backEnabled, setValue: setBackEnabled } =
    useConfigBooleanSetting(TITLE_BAR_BACK_CONFIG_KEY);
  const { value: forwardEnabled, setValue: setForwardEnabled } = useConfigBooleanSetting(
    TITLE_BAR_FORWARD_CONFIG_KEY,
  );
  const { value: refreshEnabled, setValue: setRefreshEnabled } = useConfigBooleanSetting(
    TITLE_BAR_REFRESH_CONFIG_KEY,
  );

  return {
    backEnabled,
    forwardEnabled,
    refreshEnabled,
    setBackEnabled,
    setForwardEnabled,
    setRefreshEnabled,
  };
}

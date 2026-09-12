import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

export const POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY = "pause_auto_scroll_on_popup";

export function usePopupAutoScrollPauseSetting(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const { value: enabled, setValue: setEnabled } = useConfigBooleanSetting(
    POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY,
    true,
  );

  return { enabled, setEnabled };
}

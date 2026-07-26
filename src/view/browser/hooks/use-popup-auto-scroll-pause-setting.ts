import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";

export const POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY = "pause_auto_scroll_on_popup";

function readPopupAutoScrollPauseEnabled(): boolean {
  // 変更理由: 既存ユーザーのポップアップ表示中の停止動作を維持するため、
  // 設定値がまだ保存されていない環境でも既定で有効として扱う。
  return container.config.get(POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY) !== "off";
}

export function usePopupAutoScrollPauseSetting(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const [enabled, setEnabledState] = useState(readPopupAutoScrollPauseEnabled);

  useEffect(() => {
    const sync = () => setEnabledState(readPopupAutoScrollPauseEnabled());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY) {
        sync();
      }
    };

    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    void container.config.set(
      POPUP_AUTO_SCROLL_PAUSE_CONFIG_KEY,
      nextEnabled ? "on" : "off",
    );
  }, []);

  return { enabled, setEnabled };
}

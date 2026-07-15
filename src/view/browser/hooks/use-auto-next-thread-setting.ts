import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";

export const AUTO_NEXT_THREAD_CONFIG_KEY = "auto_next_thread";

function readAutoNextThreadEnabled(): boolean {
  return container.config.get(AUTO_NEXT_THREAD_CONFIG_KEY) === "on";
}

export function useAutoNextThreadSetting(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const [enabled, setEnabledState] = useState(readAutoNextThreadEnabled);

  useEffect(() => {
    const sync = () => setEnabledState(readAutoNextThreadEnabled());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === AUTO_NEXT_THREAD_CONFIG_KEY) {
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
    // ミニウィンドウ操作直後に表示を揃えるため、config 更新待ちの前にローカル値も更新する。
    setEnabledState(nextEnabled);
    void container.config.set(AUTO_NEXT_THREAD_CONFIG_KEY, nextEnabled ? "on" : "off");
  }, []);

  return { enabled, setEnabled };
}

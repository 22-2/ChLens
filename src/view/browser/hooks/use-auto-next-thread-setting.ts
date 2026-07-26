import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";
import type { AutoNextThreadMode } from "src/view/browser/utils/next-thread-search";

export const AUTO_NEXT_THREAD_CONFIG_KEY = "auto_next_thread";
export const AUTO_NEXT_THREAD_MODE_CONFIG_KEY = "auto_next_thread_mode";

function readAutoNextThreadEnabled(): boolean {
  return container.config.get(AUTO_NEXT_THREAD_CONFIG_KEY) === "on";
}

function readAutoNextThreadMode(): AutoNextThreadMode {
  const value = container.config.get(AUTO_NEXT_THREAD_MODE_CONFIG_KEY);
  if (value === "cautious" || value === "balanced" || value === "aggressive") {
    return value;
  }
  return "balanced";
}

export function useAutoNextThreadSetting(): {
  enabled: boolean;
  mode: AutoNextThreadMode;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: AutoNextThreadMode) => void;
} {
  const [enabled, setEnabledState] = useState(readAutoNextThreadEnabled);
  const [mode, setModeState] = useState(readAutoNextThreadMode);

  useEffect(() => {
    const sync = () => {
      setEnabledState(readAutoNextThreadEnabled());
      setModeState(readAutoNextThreadMode());
    };
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === AUTO_NEXT_THREAD_CONFIG_KEY || key === AUTO_NEXT_THREAD_MODE_CONFIG_KEY) {
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

  const setMode = useCallback((nextMode: AutoNextThreadMode) => {
    setModeState(nextMode);
    void container.config.set(AUTO_NEXT_THREAD_MODE_CONFIG_KEY, nextMode);
  }, []);

  return { enabled, mode, setEnabled, setMode };
}

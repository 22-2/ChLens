import { useCallback, useEffect, useState } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";
import type { AutoNextThreadMode } from "src/view/browser/utils/next-thread-search";

export const AUTO_NEXT_THREAD_CONFIG_KEY = "auto_next_thread";
export const AUTO_NEXT_THREAD_MODE_CONFIG_KEY = "auto_next_thread_mode";

function readAutoNextThreadMode(): AutoNextThreadMode {
  const value = readConfigValue(AUTO_NEXT_THREAD_MODE_CONFIG_KEY);
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
  const { value: enabled, setValue: setEnabled } = useConfigBooleanSetting(
    AUTO_NEXT_THREAD_CONFIG_KEY,
  );
  const [mode, setModeState] = useState(readAutoNextThreadMode);

  useEffect(() => {
    return subscribeConfigKeys(
      [AUTO_NEXT_THREAD_MODE_CONFIG_KEY],
      () => setModeState(readAutoNextThreadMode()),
      { label: "AutoNextThreadSetting" },
    );
  }, []);

  const setMode = useCallback((nextMode: AutoNextThreadMode) => {
    setModeState(nextMode);
    persistConfigValue(AUTO_NEXT_THREAD_MODE_CONFIG_KEY, nextMode, "AutoNextThreadSetting");
  }, []);

  return { enabled, mode, setEnabled, setMode };
}

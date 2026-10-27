import { useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";

export const THREAD_READ_POSITION_MODE_CONFIG_KEY = "thread_read_position_mode";
export type ThreadReadPositionMode = "auto" | "manual";

function readMode(): ThreadReadPositionMode {
  const value =
    readConfigValue(THREAD_READ_POSITION_MODE_CONFIG_KEY) ??
    DEFAULT_CONFIG[THREAD_READ_POSITION_MODE_CONFIG_KEY];
  return value === "manual" ? "manual" : "auto";
}

export function useThreadReadPositionMode(): ThreadReadPositionMode {
  const [mode, setMode] = useState(readMode);

  useEffect(
    () =>
      subscribeConfigKeys([THREAD_READ_POSITION_MODE_CONFIG_KEY], () => setMode(readMode()), {
        label: "ThreadReadPositionMode",
      }),
    [],
  );

  return mode;
}

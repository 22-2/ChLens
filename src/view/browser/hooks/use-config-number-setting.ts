import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";

interface UseConfigNumberSettingResult {
  value: number;
  setValue: (value: number) => void;
}

function readConfigNumber(key: string, defaultValue: number): number {
  const configuredValue = readConfigValue(key) ?? DEFAULT_CONFIG[key];
  if (configuredValue == null) return defaultValue;

  const parsedValue = Number(configuredValue);
  return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}

export function useConfigNumberSetting(
  key: string,
  defaultValue = Number(DEFAULT_CONFIG[key] ?? 0),
): UseConfigNumberSettingResult {
  const [value, setValue] = useState(() => readConfigNumber(key, defaultValue));

  useEffect(() => {
    const sync = () => setValue(readConfigNumber(key, defaultValue));
    return subscribeConfigKeys([key], sync, { label: "ConfigNumberSetting" });
  }, [defaultValue, key]);

  const setValueAndPersist = useCallback(
    (nextValue: number) => {
      setValue(nextValue);
      persistConfigValue(key, String(nextValue), "ConfigNumberSetting");
    },
    [key],
  );

  return { value, setValue: setValueAndPersist };
}

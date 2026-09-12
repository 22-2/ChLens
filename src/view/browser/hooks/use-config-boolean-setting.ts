import { useCallback, useEffect, useState } from "react";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";

interface UseConfigBooleanSettingResult {
  value: boolean;
  setValue: (value: boolean) => void;
}

function readConfigBoolean(key: string, defaultValue: boolean): boolean {
  const configuredValue = readConfigValue(key);
  if (configuredValue == null) {
    return defaultValue;
  }

  // 変更理由: 既存設定には「未設定なら有効」の項目もあるため、
  // 初期値を基準に未定義値の扱いを決め、各フックで判定がずれないようにする。
  return defaultValue ? configuredValue !== "off" : configuredValue === "on";
}

export function useConfigBooleanSetting(
  key: string,
  defaultValue = false,
): UseConfigBooleanSettingResult {
  const [value, setValue] = useState(() => readConfigBoolean(key, defaultValue));

  useEffect(() => {
    const sync = () => setValue(readConfigBoolean(key, defaultValue));
    return subscribeConfigKeys([key], sync, { label: "ConfigBooleanSetting" });
  }, [defaultValue, key]);

  const setValueAndPersist = useCallback(
    (nextValue: boolean) => {
      setValue(nextValue);
      persistConfigValue(key, nextValue ? "on" : "off", "ConfigBooleanSetting");
    },
    [key],
  );

  return { value, setValue: setValueAndPersist };
}

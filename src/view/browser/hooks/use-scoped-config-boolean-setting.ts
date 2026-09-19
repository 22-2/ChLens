import { useCallback, useEffect, useState } from "react";
import { persistConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  persistScopedSettingForUrl,
  readScopedConfigValue,
  SCOPED_SETTINGS_CONFIG_KEY,
  type ScopedSettingKey,
} from "src/view/browser/utils/scoped-settings";

function readBooleanValue(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
  defaultValue: boolean,
): boolean {
  const configuredValue = readScopedConfigValue(key, rawUrl);
  if (configuredValue == null) {
    return defaultValue;
  }
  return defaultValue ? configuredValue !== "off" : configuredValue === "on";
}

/** 現在の板を優先し、板設定がなければサイト・全体設定へフォールバックする。 */
export function useScopedConfigBooleanSetting(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
  defaultValue = false,
): { value: boolean; setValue: (value: boolean) => void } {
  const [value, setValueState] = useState(() => readBooleanValue(key, rawUrl, defaultValue));

  useEffect(() => {
    const sync = () => setValueState(readBooleanValue(key, rawUrl, defaultValue));
    return subscribeConfigKeys(rawUrl ? [key, SCOPED_SETTINGS_CONFIG_KEY] : [key], sync, {
      label: "ScopedConfigBooleanSetting",
    });
  }, [defaultValue, key, rawUrl]);

  const setValue = useCallback(
    (nextValue: boolean) => {
      setValueState(nextValue);
      if (rawUrl) {
        void persistScopedSettingForUrl(key, rawUrl, nextValue ? "on" : "off").catch(
          (error: unknown) => {
            console.error("[ScopedConfigBooleanSetting] 設定の保存に失敗しました", error);
          },
        );
      } else {
        persistConfigValue(key, nextValue ? "on" : "off", "ScopedConfigBooleanSetting");
      }
    },
    [key, rawUrl],
  );

  return { value, setValue };
}

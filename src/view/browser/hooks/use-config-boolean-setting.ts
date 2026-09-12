import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";

interface UseConfigBooleanSettingResult {
  value: boolean;
  setValue: (value: boolean) => void;
}

function readConfigBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const configuredValue = container.config.get(key);
    if (configuredValue == null) {
      return defaultValue;
    }

    // 変更理由: 既存設定には「未設定なら有効」の項目もあるため、
    // 初期値を基準に未定義値の扱いを決め、各フックで判定がずれないようにする。
    return defaultValue ? configuredValue !== "off" : configuredValue === "on";
  } catch (error) {
    // 設定サービスが使えないhostでも既定値で表示を継続し、原因はログへ残す。
    console.error("[ConfigBooleanSetting] 設定の読み込みに失敗しました: " + key, error);
    return defaultValue;
  }
}

export function useConfigBooleanSetting(
  key: string,
  defaultValue = false,
): UseConfigBooleanSettingResult {
  const [value, setValue] = useState(() => readConfigBoolean(key, defaultValue));

  useEffect(() => {
    const sync = () => setValue(readConfigBoolean(key, defaultValue));
    const handleConfigUpdated = ({ key: updatedKey }: { key?: string }) => {
      if (updatedKey === key) {
        sync();
      }
    };

    let subscribed = false;
    try {
      container.config.ready(sync);
      container.message.on("config_updated", handleConfigUpdated);
      subscribed = true;
    } catch (error) {
      // 変更理由: 一部hostでは設定serviceの初期化順が異なるため、
      // 購読できなくても画面を壊さず、初期値を表示したまま原因を記録する。
      console.error("[ConfigBooleanSetting] 設定変更通知の購読に失敗しました: " + key, error);
    }

    return () => {
      if (!subscribed) {
        return;
      }
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [defaultValue, key]);

  const setValueAndPersist = useCallback(
    (nextValue: boolean) => {
      setValue(nextValue);
      try {
        void Promise.resolve(container.config.set(key, nextValue ? "on" : "off")).catch(
          (error: unknown) => {
            console.error("[ConfigBooleanSetting] 設定の保存に失敗しました: " + key, error);
          },
        );
      } catch (error) {
        // config.setが同期例外を投げる実装でも、画面側の操作を中断させずログへ残す。
        console.error("[ConfigBooleanSetting] 設定の保存に失敗しました: " + key, error);
      }
    },
    [key],
  );

  return { value, setValue: setValueAndPersist };
}

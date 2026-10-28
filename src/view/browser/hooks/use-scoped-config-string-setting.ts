import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  persistScopedSettingForUrl,
  readScopedConfigValue,
  SCOPED_SETTINGS_CONFIG_KEY,
  type ScopedSettingKey,
} from "src/view/browser/utils/scoped-settings";

const logger = createLogger("view/browser");

/** 投稿先を切り替えても板ごとの設定を読み、設定画面からの変更も反映する。 */
export function useScopedConfigStringSetting(key: ScopedSettingKey, url: string) {
  const [state, setState] = useState(() => ({ url, value: readScopedConfigValue(key, url) ?? "" }));
  const pending = useRef(0);
  const latestUrl = useRef(url);
  latestUrl.current = url;
  const value = state.url === url ? state.value : (readScopedConfigValue(key, url) ?? "");
  useEffect(
    () =>
      subscribeConfigKeys(
        [key, SCOPED_SETTINGS_CONFIG_KEY],
        () => {
          if (pending.current === 0)
            setState({ url, value: readScopedConfigValue(key, url) ?? "" });
        },
        { label: "ScopedConfigStringSetting" },
      ),
    [key, url],
  );
  const setValue = useCallback(
    (next: string) => {
      setState({ url, value: next });
      pending.current += 1;
      void persistScopedSettingForUrl(key, url, next)
        .catch((error: unknown) => logger.error("書き込み設定の保存に失敗しました", error))
        .finally(() => {
          pending.current -= 1;
          if (pending.current === 0 && latestUrl.current === url) {
            setState({ url, value: readScopedConfigValue(key, url) ?? "" });
          }
        });
    },
    [key, url],
  );
  return { value, setValue };
}

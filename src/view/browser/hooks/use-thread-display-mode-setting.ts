import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";

export const THREAD_DISPLAY_MODE_CONFIG_KEY = "thread_display_mode";

export type ThreadDisplayMode = "normal" | "live-chat";

export function normalizeThreadDisplayMode(value: string | null | undefined): ThreadDisplayMode {
  // 未知値や未保存時は従来どおり通常表示に戻し、新着が時間差で隠れる状態を避ける。
  return value === "live-chat" ? "live-chat" : "normal";
}

export function readThreadDisplayMode(): ThreadDisplayMode {
  return normalizeThreadDisplayMode(
    readConfigValue(THREAD_DISPLAY_MODE_CONFIG_KEY) ?? DEFAULT_CONFIG.thread_display_mode,
  );
}

/**
 * スレッドの表示形式（通常 / ライブチャット風）を設定として読み書きする。
 *
 * 変更理由: 以前はタブの一時状態として持っていたため、新しいタブでスレを開くたびに
 * 「通常」へ戻り、利用者からは保存されないように見えた。同じ自動更新パネルの
 * 更新間隔・自動停止時間などと同じく config を唯一の保存先にし、経路を揃える。
 */
export function useThreadDisplayModeSetting(): {
  mode: ThreadDisplayMode;
  setMode: (mode: ThreadDisplayMode) => void;
} {
  const [mode, setModeState] = useState(readThreadDisplayMode);

  useEffect(() => {
    return subscribeConfigKeys(
      [THREAD_DISPLAY_MODE_CONFIG_KEY],
      () => setModeState(readThreadDisplayMode()),
      { label: "ThreadDisplayModeSetting" },
    );
  }, []);

  const setMode = useCallback((nextMode: ThreadDisplayMode) => {
    setModeState(nextMode);
    persistConfigValue(THREAD_DISPLAY_MODE_CONFIG_KEY, nextMode, "ThreadDisplayModeSetting");
  }, []);

  return { mode, setMode };
}

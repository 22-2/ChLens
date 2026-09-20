import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  findIdleStopTimeoutOption,
  type IdleStopTimeoutOption,
  MAX_BOARD_AUTO_REFRESH_SEC,
  MAX_THREAD_AUTO_REFRESH_SEC,
  MIN_BOARD_AUTO_REFRESH_SEC,
  MIN_THREAD_AUTO_REFRESH_SEC,
  readBoardAutoRefreshIntervalSec,
  readIdleStopTimeoutValue,
  readThreadAutoRefreshIntervalSec,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
  THREAD_IDLE_STOP_TIMEOUT_CONFIG_KEY,
} from "src/view/browser/hooks/auto-refresh-config";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/utils/auto-refresh-pages";
import { persistConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  persistScopedSettingForUrl,
  SCOPED_SETTINGS_CONFIG_KEY,
} from "src/view/browser/utils/scoped-settings";

export const MIN_INTERVAL_SEC = MIN_THREAD_AUTO_REFRESH_SEC;
export const MAX_INTERVAL_SEC = MAX_THREAD_AUTO_REFRESH_SEC;
export const MIN_BOARD_INTERVAL_SEC = MIN_BOARD_AUTO_REFRESH_SEC;
export const MAX_BOARD_INTERVAL_SEC = MAX_BOARD_AUTO_REFRESH_SEC;

type AutoRefreshPanelKind = "thread" | "threadList" | null;

function useConfigIntervalSec(options: {
  configKey: string;
  readIntervalSec: () => number;
  minSec: number;
  maxSec: number;
  scopeUrl?: string;
}): {
  intervalSec: number;
  setIntervalSec: (sec: number) => void;
} {
  const { configKey, readIntervalSec, minSec, maxSec, scopeUrl } = options;
  const [intervalSec, setIntervalSecState] = useState(readIntervalSec);

  useEffect(() => {
    const sync = () => setIntervalSecState(readIntervalSec());
    return subscribeConfigKeys(
      scopeUrl ? [configKey, SCOPED_SETTINGS_CONFIG_KEY] : [configKey],
      sync,
      { label: "AutoRefreshPanel" },
    );
  }, [configKey, readIntervalSec, scopeUrl]);

  const setIntervalSec = useCallback(
    (sec: number) => {
      const clamped = Math.max(minSec, Math.min(maxSec, sec));
      setIntervalSecState(clamped);
      if (scopeUrl) {
        // 変更理由: 表示中の板で間隔を変えた操作は、その板の実況用途に合わせた
        // 意図として保存し、ほかのサイト・板の更新間隔へ波及させない。
        void persistScopedSettingForUrl(
          configKey as "auto_load_second" | "auto_load_second_board",
          scopeUrl,
          String(clamped * 1000),
        ).catch((error: unknown) => {
          console.error("[AutoRefreshPanel] スコープ設定の保存に失敗しました", error);
        });
      } else {
        persistConfigValue(configKey, String(clamped * 1000), "AutoRefreshPanel");
      }
    },
    [configKey, maxSec, minSec, scopeUrl],
  );

  return { intervalSec, setIntervalSec };
}

export interface UseAutoRefreshPanelResult {
  /** 現在のパネル種別 */
  panelKind: AutoRefreshPanelKind;
  /** 現在アクティブタブがスレッドページかどうか */
  isOnThread: boolean;
  /** 現在のアクティブタブで自動更新が有効かどうか */
  isEnabled: boolean;
  /** 更新間隔（秒） */
  intervalSec: number;
  /** 現在の自動停止タイムアウト設定値 */
  idleStopTimeoutValue: string;
  /** 現在の自動停止タイムアウトの表示用オプション */
  idleStopTimeoutOption: IdleStopTimeoutOption;
  /** 自動更新の有効/無効をトグルする */
  toggle: () => void;
  /** 更新間隔を変更する（秒単位、MIN〜MAX にクランプ） */
  setIntervalSec: (sec: number) => void;
  /** 自動停止タイムアウトを変更する */
  setIdleStopTimeout: (value: string) => void;
}

export function useAutoRefreshPanel(): UseAutoRefreshPanelResult {
  const { currentPage, activeTab, dispatch } = useTabStore();
  const scopeUrl = useMemo(() => {
    if (currentPage.type === "thread") {
      return currentPage.threadUrl;
    }
    if (currentPage.type === "threadList") {
      return currentPage.boardUrl;
    }
    return undefined;
  }, [currentPage]);
  const readThreadIntervalSec = useCallback(
    () => readThreadAutoRefreshIntervalSec(scopeUrl),
    [scopeUrl],
  );
  const readBoardIntervalSec = useCallback(
    () => readBoardAutoRefreshIntervalSec(scopeUrl),
    [scopeUrl],
  );
  const threadInterval = useConfigIntervalSec({
    configKey: THREAD_AUTO_REFRESH_CONFIG_KEY,
    readIntervalSec: readThreadIntervalSec,
    minSec: MIN_INTERVAL_SEC,
    maxSec: MAX_INTERVAL_SEC,
    scopeUrl: currentPage.type === "thread" ? scopeUrl : undefined,
  });
  const boardInterval = useConfigIntervalSec({
    configKey: BOARD_AUTO_REFRESH_CONFIG_KEY,
    readIntervalSec: readBoardIntervalSec,
    minSec: MIN_BOARD_INTERVAL_SEC,
    maxSec: MAX_BOARD_INTERVAL_SEC,
    scopeUrl: currentPage.type === "threadList" ? scopeUrl : undefined,
  });

  const [idleStopTimeoutValue, setIdleStopTimeoutValueState] = useState(readIdleStopTimeoutValue);

  useEffect(() => {
    const sync = () => setIdleStopTimeoutValueState(readIdleStopTimeoutValue());
    return subscribeConfigKeys([THREAD_IDLE_STOP_TIMEOUT_CONFIG_KEY], sync, {
      label: "AutoRefreshPanel",
    });
  }, []);

  const setIdleStopTimeout = useCallback((value: string) => {
    setIdleStopTimeoutValueState(value);
    persistConfigValue(THREAD_IDLE_STOP_TIMEOUT_CONFIG_KEY, value, "AutoRefreshPanel");
  }, []);

  const idleStopTimeoutOption = findIdleStopTimeoutOption(idleStopTimeoutValue);

  const panelKind: AutoRefreshPanelKind =
    currentPage.type === "thread"
      ? "thread"
      : currentPage.type === "threadList"
        ? "threadList"
        : null;
  const currentPageKey = getAutoRefreshPageKey(currentPage);
  const isOnThread = panelKind === "thread";
  const isEnabled = currentPageKey != null && isAutoRefreshEnabledForPage(activeTab, currentPage);
  const intervalSec =
    panelKind === "thread" ? threadInterval.intervalSec : boardInterval.intervalSec;
  const setIntervalSec =
    panelKind === "thread" ? threadInterval.setIntervalSec : boardInterval.setIntervalSec;

  const toggle = useCallback(() => {
    if (currentPageKey == null) {
      return;
    }

    dispatch(tabActions.setAutoRefreshEnabled(!isEnabled, currentPageKey));
  }, [currentPageKey, dispatch, isEnabled]);

  return {
    panelKind,
    isOnThread,
    isEnabled,
    intervalSec,
    idleStopTimeoutValue,
    idleStopTimeoutOption,
    toggle,
    setIntervalSec,
    setIdleStopTimeout,
  };
}

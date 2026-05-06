import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MAX_BOARD_AUTO_REFRESH_SEC,
  MIN_BOARD_AUTO_REFRESH_SEC,
  readBoardAutoRefreshIntervalSec,
  MAX_THREAD_AUTO_REFRESH_SEC,
  MIN_THREAD_AUTO_REFRESH_SEC,
  readThreadAutoRefreshIntervalSec,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
} from "src/view/browser/hooks/auto-refresh-config";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/utils/auto-refresh-pages";

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
}): {
  intervalSec: number;
  setIntervalSec: (sec: number) => void;
} {
  const { configKey, readIntervalSec, minSec, maxSec } = options;
  const [intervalSec, setIntervalSecState] = useState(readIntervalSec);

  useEffect(() => {
    const sync = () => setIntervalSecState(readIntervalSec());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === configKey) {
        sync();
      }
    };

    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [configKey, readIntervalSec]);

  const setIntervalSec = useCallback(
    (sec: number) => {
      const clamped = Math.max(minSec, Math.min(maxSec, sec));
      setIntervalSecState(clamped);
      container.config.set(configKey, String(clamped * 1000));
    },
    [configKey, maxSec, minSec],
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
  /** 自動更新の有効/無効をトグルする */
  toggle: () => void;
  /** 更新間隔を変更する（秒単位、MIN〜MAX にクランプ） */
  setIntervalSec: (sec: number) => void;
}

export function useAutoRefreshPanel(): UseAutoRefreshPanelResult {
  const { currentPage, activeTab, dispatch } = useTabStore();
  const threadInterval = useConfigIntervalSec({
    configKey: THREAD_AUTO_REFRESH_CONFIG_KEY,
    readIntervalSec: readThreadAutoRefreshIntervalSec,
    minSec: MIN_INTERVAL_SEC,
    maxSec: MAX_INTERVAL_SEC,
  });
  const boardInterval = useConfigIntervalSec({
    configKey: BOARD_AUTO_REFRESH_CONFIG_KEY,
    readIntervalSec: readBoardAutoRefreshIntervalSec,
    minSec: MIN_BOARD_INTERVAL_SEC,
    maxSec: MAX_BOARD_INTERVAL_SEC,
  });

  const panelKind: AutoRefreshPanelKind =
    currentPage.type === "thread"
      ? "thread"
      : currentPage.type === "threadList"
        ? "threadList"
        : null;
  const currentPageKey = getAutoRefreshPageKey(currentPage);
  const isOnThread = panelKind === "thread";
  const isEnabled =
    currentPageKey != null && isAutoRefreshEnabledForPage(activeTab, currentPage);
  const intervalSec =
    panelKind === "thread" ? threadInterval.intervalSec : boardInterval.intervalSec;
  const setIntervalSec =
    panelKind === "thread"
      ? threadInterval.setIntervalSec
      : boardInterval.setIntervalSec;

  const toggle = useCallback(() => {
    if (currentPageKey == null) {
      return;
    }

    dispatch({
      type: "SET_AUTO_REFRESH_ENABLED",
      enabled: !isEnabled,
      pageKey: currentPageKey,
    });
  }, [currentPageKey, dispatch, isEnabled]);

  return {
    panelKind,
    isOnThread,
    isEnabled,
    intervalSec,
    toggle,
    setIntervalSec,
  };
}

import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";
import {
  MAX_THREAD_AUTO_REFRESH_SEC,
  MIN_THREAD_AUTO_REFRESH_SEC,
  readThreadAutoRefreshIntervalSec,
  THREAD_AUTO_REFRESH_CONFIG_KEY,
} from "src/view/browser/hooks/auto-refresh-config";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

export const MIN_INTERVAL_SEC = MIN_THREAD_AUTO_REFRESH_SEC;
export const MAX_INTERVAL_SEC = MAX_THREAD_AUTO_REFRESH_SEC;

export interface UseAutoRefreshPanelResult {
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
  const [intervalSec, setIntervalSecState] = useState(
    readThreadAutoRefreshIntervalSec,
  );

  const isOnThread = currentPage.type === "thread";
  const isEnabled =
    isOnThread &&
    activeTab.autoRefreshEnabled &&
    activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

  // config の変更を購読して intervalSec を同期する
  useEffect(() => {
    const sync = () => setIntervalSecState(readThreadAutoRefreshIntervalSec());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === THREAD_AUTO_REFRESH_CONFIG_KEY) sync();
    };

    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  const toggle = useCallback(() => {
    if (!isOnThread || currentPage.type !== "thread") return;
    dispatch({
      type: "SET_AUTO_REFRESH_ENABLED",
      enabled: !isEnabled,
      threadUrl: currentPage.threadUrl,
    });
  }, [dispatch, isEnabled, isOnThread, currentPage]);

  const setIntervalSec = useCallback((sec: number) => {
    const clamped = Math.max(MIN_INTERVAL_SEC, Math.min(MAX_INTERVAL_SEC, sec));
    // UI をすぐ反映するためローカル状態も即時更新する
    setIntervalSecState(clamped);
    // config に ms で保存することで use-auto-refresh.ts のタイマーにも反映される
    container.config.set(
      THREAD_AUTO_REFRESH_CONFIG_KEY,
      String(clamped * 1000),
    );
  }, []);

  return { isOnThread, isEnabled, intervalSec, toggle, setIntervalSec };
}

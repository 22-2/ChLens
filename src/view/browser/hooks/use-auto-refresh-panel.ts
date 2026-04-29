import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

// use-auto-refresh.ts と同じキー
const CONFIG_KEY = "auto_load_second";

export const MIN_INTERVAL_SEC = 5;
export const MAX_INTERVAL_SEC = 120;
const DEFAULT_INTERVAL_SEC = 30;

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

// config から更新間隔を秒単位で読む。
// config は ms で保存されている（use-auto-refresh.ts の仕様に準拠）。
function readIntervalSec(): number {
  const raw = container.config.get(CONFIG_KEY);
  const ms = Number.parseInt(raw ?? "0", 10);
  if (Number.isNaN(ms) || ms <= 0) return DEFAULT_INTERVAL_SEC;
  return Math.max(MIN_INTERVAL_SEC, Math.round(ms / 1000));
}

export function useAutoRefreshPanel(): UseAutoRefreshPanelResult {
  const { currentPage, activeTab, dispatch } = useTabStore();
  const [intervalSec, setIntervalSecState] = useState(readIntervalSec);

  const isOnThread = currentPage.type === "thread";
  const isEnabled =
    isOnThread &&
    activeTab.autoRefreshEnabled &&
    activeTab.autoRefreshThreadUrl === currentPage.threadUrl;

  // config の変更を購読して intervalSec を同期する
  useEffect(() => {
    const sync = () => setIntervalSecState(readIntervalSec());
    container.config.ready(sync);
    container.message.on("config_updated", ({ key }: { key?: string }) => {
      if (key === CONFIG_KEY) sync();
    });
    return () => {
      container.message.off("config_updated", sync);
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
    container.config.set(CONFIG_KEY, String(clamped * 1000));
  }, []);

  return { isOnThread, isEnabled, intervalSec, toggle, setIntervalSec };
}

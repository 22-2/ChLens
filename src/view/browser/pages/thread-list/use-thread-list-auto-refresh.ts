import { type RefObject, useEffect, useState } from "react";
import {
  BOARD_AUTO_REFRESH_CONFIG_KEY,
  MIN_BOARD_AUTO_REFRESH_MS,
  readBoardAutoRefreshIntervalMs,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { container } from "src/service-container/index";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { SCOPED_SETTINGS_CONFIG_KEY } from "src/view/browser/utils/scoped-settings";

interface UseThreadListAutoRefreshOptions {
  boardUrl: string;
  refreshKey: number;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  /** 過去の履歴を表示している間は、最新の一覧で上書きしないため自動更新しない。 */
  hasSelectedSnapshot: boolean;
  loading: boolean;
  /** 自動更新による再読み込みだけをデータ取得側が見分けるための印。 */
  autoRefreshRequestRef: RefObject<{ boardUrl: string; refreshKey: number } | null>;
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  viewWindow: Window;
  viewDocument: Document;
}

/**
 * スレ一覧の自動更新タイマー。表示中のタブで、設定された間隔ごとに RELOAD を発行する。
 */
export function useThreadListAutoRefresh({
  boardUrl,
  refreshKey,
  isActive,
  isAutoRefreshEnabled,
  hasSelectedSnapshot,
  loading,
  autoRefreshRequestRef,
  runTabCommand,
  viewWindow,
  viewDocument,
}: UseThreadListAutoRefreshOptions): void {
  const [boardAutoRefreshIntervalMs, setBoardAutoRefreshIntervalMs] = useState(() =>
    readBoardAutoRefreshIntervalMs(boardUrl),
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    viewDocument.visibilityState === "visible",
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(viewDocument.visibilityState === "visible");
    };

    viewDocument.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      viewDocument.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [viewDocument]);

  useEffect(() => {
    const applyInterval = () => {
      setBoardAutoRefreshIntervalMs(readBoardAutoRefreshIntervalMs(boardUrl));
    };

    // 変更理由: 板一覧のタイマーも対象板の上書きを読むため、
    // 共通設定とスコープ設定のどちらが変わっても現在値を再評価する。
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === BOARD_AUTO_REFRESH_CONFIG_KEY || key === SCOPED_SETTINGS_CONFIG_KEY) {
        applyInterval();
      }
    };

    container.config.ready(applyInterval);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [boardUrl]);

  useEffect(() => {
    if (
      !isAutoRefreshEnabled ||
      hasSelectedSnapshot ||
      !isActive ||
      !isDocumentVisible ||
      boardAutoRefreshIntervalMs < MIN_BOARD_AUTO_REFRESH_MS
    ) {
      return;
    }

    const timerId = viewWindow.setInterval(() => {
      if (loading) {
        return;
      }

      // タブを切り替えた瞬間に旧タブの更新が走ると体感が悪いため、
      // 一覧の自動更新は表示中タブの RELOAD 経路だけを使って発火する。
      // 同じRELOAD経路を使う手動更新と区別し、自動更新だけ進捗をステータスバーへ出す。
      autoRefreshRequestRef.current = { boardUrl, refreshKey };
      if (!runTabCommand(TAB_COMMAND_IDS.RELOAD)) autoRefreshRequestRef.current = null;
    }, boardAutoRefreshIntervalMs);

    return () => {
      viewWindow.clearInterval(timerId);
    };
  }, [
    autoRefreshRequestRef,
    boardAutoRefreshIntervalMs,
    boardUrl,
    hasSelectedSnapshot,
    isActive,
    isAutoRefreshEnabled,
    isDocumentVisible,
    loading,
    refreshKey,
    runTabCommand,
    viewWindow,
  ]);
}

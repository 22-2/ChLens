import { ArrowLeft, ArrowRight, PanelRight, RotateCw, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createLogger } from "src/app/logger";
import { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import { TabContextMenu } from "src/features/tabs/ui/TabContextMenu";
import { createSnapshotMenuItems } from "src/features/thread-list/ui/thread-list-snapshot-menu-items";
import {
  getThreadListSnapshots,
  selectThreadListSnapshot,
  type ThreadListSnapshot,
  useSelectedThreadListSnapshot,
} from "src/features/thread-list/ui/thread-list-snapshots";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import { TAB_COMMAND_IDS } from "src/view/browser/commands/tab-command-runtime";
import { useTitleBarButtonSettings } from "src/view/browser/hooks/use-title-bar-navigation-setting";
import { normalizeSidePanel } from "src/view/browser/state/tabs/side-panel-state";
import { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";
import { useSidePanelState, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { canGoBack, canGoForward } from "src/view/browser/types";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  getManualRefreshScopeKey,
  runManualRefresh,
  useManualRefreshCooldown,
} from "src/view/browser/utils/manual-refresh";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

interface TitleBarMenuPosition {
  x: number;
  y: number;
}

const logger = createLogger("view/browser");

export interface TitleBarProps {
  /** タイトルバー左端の戻る・進む・更新を表示するかどうか。 */
  showNavigationButtons?: boolean;
  /**
   * タイトルをクリックでURL入力へ切り替えるピルにするかどうか。
   * 変更理由: オムニバーの状態を持つ NavigationBar がない画面（切り離したタブの別窓）では、
   * 共有のコマンドパレットを本窓側で開いてしまうため、タイトルを表示だけにできるようにする。
   */
  omnibarEnabled?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  showNavigationButtons = true,
  omnibarEnabled = true,
}) => {
  const { viewTab, viewPage, paneId } = useTabStore();
  const { state: savedPanel, dispatch: dispatchPanel } = useSidePanelState();
  const panel = normalizeSidePanel(savedPanel);
  const title = viewPage.title || "read.crx 2";
  const runTabCommand = useTabCommandRunner(viewTab.id);
  const { backEnabled, forwardEnabled, refreshEnabled } = useTitleBarButtonSettings();
  const canNavigateBack = canGoBack(viewTab);
  const canNavigateForward = canGoForward(viewTab);
  const canRefresh = isPageRefreshable(viewPage);
  const manualRefreshScopeKey = getManualRefreshScopeKey(viewTab.id, viewPage);
  const refreshCoolingDown = useManualRefreshCooldown(manualRefreshScopeKey);
  const [menuPosition, setMenuPosition] = useState<TitleBarMenuPosition | null>(null);
  const [refreshMenuPosition, setRefreshMenuPosition] = useState<TitleBarMenuPosition | null>(null);
  const [threadListSnapshots, setThreadListSnapshots] = useState<ThreadListSnapshot[]>([]);
  const boardUrl = viewPage.type === "threadList" ? viewPage.boardUrl : null;
  const selectedSnapshot = useSelectedThreadListSnapshot(viewTab.id);
  // 変更理由: 相対時刻の基準をメニューを開いた時点に固定し、開くたびに経過時間を計算し直す。
  const refreshMenuOpenedAt = useMemo(() => Date.now(), [refreshMenuPosition]);
  const refreshDisabled = !canRefresh || refreshCoolingDown;

  useEffect(() => {
    if (!refreshMenuPosition || !boardUrl) return;
    let cancelled = false;
    void getThreadListSnapshots(boardUrl)
      .then((entries) => {
        if (!cancelled) setThreadListSnapshots(entries);
      })
      .catch((error: unknown) => {
        logger.error("スレ一覧の履歴を読み込めませんでした:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [boardUrl, refreshMenuPosition]);

  const handleTitleContextMenu = useCallback((e: React.MouseEvent) => {
    // 変更理由: タイトルバーのタイトル右クリックでは、タブを右クリックした時と同じ
    // メニューを出し、タブ操作の導線をタイトルバーからも利用できるようにする。
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuPosition(null), []);

  const handleRefreshContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null;
      if (!target?.closest(".title-bar__refresh-target")) return;

      // 変更理由: 更新ボタンの既定コンテキストメニューを抑止し、履歴メニューへ置き換える。
      event.preventDefault();
      event.stopPropagation();
      if (!boardUrl) return;
      // 変更理由: スナップショット復元の入口を、通常の更新と同じタイトルバー上に揃える。
      setMenuPosition(null);
      setThreadListSnapshots([]);
      setRefreshMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [boardUrl],
  );

  const snapshotMenuItems: ContextMenuItem[] = boardUrl
    ? [
        {
          id: "snapshot-heading",
          label: "一覧の履歴",
          disabled: true,
        },
        ...createSnapshotMenuItems({
          snapshots: threadListSnapshots,
          selectedSnapshot,
          now: refreshMenuOpenedAt,
          onSelect: (snapshot) => selectThreadListSnapshot(viewTab.id, snapshot),
        }),
      ]
    : [];

  return (
    <header className="title-bar" data-testid="title-bar">
      <div
        className="title-bar__leading"
        data-testid="title-bar-leading"
        onContextMenuCapture={handleRefreshContextMenu}
      >
        {/* 変更理由: 戻る・進む・更新はタブバーの向きに関係なくタイトルバーに集約する。 */}
        {showNavigationButtons && (
          <>
            {backEnabled && (
              <button
                type="button"
                className="title-bar__navigation icon-button"
                disabled={!canNavigateBack}
                onClick={() => runTabCommand(TAB_COMMAND_IDS.BACK)}
                title="戻る"
                aria-label="戻る"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            {forwardEnabled && (
              <button
                type="button"
                className="title-bar__navigation icon-button"
                disabled={!canNavigateForward}
                onClick={() => runTabCommand(TAB_COMMAND_IDS.FORWARD)}
                title="進む"
                aria-label="進む"
              >
                <ArrowRight size={14} />
              </button>
            )}
            {refreshEnabled && (
              <span className="title-bar__refresh-target">
                <button
                  type="button"
                  className="title-bar__refresh icon-button"
                  disabled={refreshDisabled}
                  onClick={() =>
                    runManualRefresh(manualRefreshScopeKey, () =>
                      runTabCommand(TAB_COMMAND_IDS.RELOAD),
                    )
                  }
                  title="更新"
                  aria-label="更新"
                >
                  <RotateCw size={14} />
                </button>
              </span>
            )}
          </>
        )}
      </div>
      <div className="title-bar__center" data-testid="title-bar-center">
        {/* 変更理由: VS Codeのコマンドセンターと同様に、通常時は検索アイコンとタイトルだけを
            見せ、クリックでURL入力（オムニバー）へ切り替える。入力欄の実体は NavigationBar が
            受け口へポータルする。入力中は受け口が空でなくなり、CSSでピルを隠す。 */}
        {omnibarEnabled ? (
          <button
            type="button"
            className="title-bar__title title-bar__title--command-center"
            data-testid="title-bar-title"
            data-page-type={viewPage.type}
            title={title}
            onClick={() => commandPalette.open("navigation")}
            onContextMenu={handleTitleContextMenu}
          >
            <Search size={14} aria-hidden="true" className="title-bar__title-icon" />
            <span className="title-bar__title-text">{title}</span>
          </button>
        ) : (
          <div
            className="title-bar__title"
            data-testid="title-bar-title"
            data-page-type={viewPage.type}
            title={title}
            onContextMenu={handleTitleContextMenu}
          >
            <span className="title-bar__title-text">{title}</span>
          </div>
        )}
        <div
          className="title-bar__command-center-slot"
          data-pane-id={paneId}
          data-testid="title-bar-command-center-slot"
        />
      </div>
      <div
        className="title-bar__actions action-toolbar-container"
        role="toolbar"
        aria-label="レイアウト操作"
      >
        <button
          type="button"
          className="title-bar__navigation icon-button"
          title={panel.isOpen ? "サイドパネルを閉じる" : "サイドパネルを開く"}
          aria-label={panel.isOpen ? "サイドパネルを閉じる" : "サイドパネルを開く"}
          aria-expanded={panel.isOpen}
          onClick={() =>
            dispatchPanel({
              type: TAB_ACTION_TYPES.UPDATE_SIDE_PANEL,
              sidePanel: { ...panel, isOpen: !panel.isOpen },
            })
          }
        >
          <PanelRight size={16} aria-hidden="true" />
        </button>
        {/* 変更理由: 垂直モードではアクティブペインではなく自ペインの NavigationBar が
            ここへポータルする。ペイン単位の data-pane-id で描画先を区別する。 */}
        <div
          className="title-bar__nav-slot"
          data-pane-id={paneId}
          data-testid="title-bar-nav-slot"
        />
        {/* 変更理由: ペイン分割はコマンドパレットから操作するため、タイトルバーの
            専用ボタンは置かない。長いタイトルで右端が圧迫される問題も避ける。 */}
      </div>
      {menuPosition && <TabContextMenu tab={viewTab} position={menuPosition} onClose={closeMenu} />}
      {refreshMenuPosition && boardUrl && (
        <ContextMenu
          x={refreshMenuPosition.x}
          y={refreshMenuPosition.y}
          items={snapshotMenuItems}
          onClose={() => setRefreshMenuPosition(null)}
        />
      )}
    </header>
  );
};

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { openArchiveReplayWindow as openArchiveReplayNativeWindow } from "src/features/archive-replay/platform";
import { AutoScrollStateProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { AutoRefreshStatusItem } from "src/features/auto-refresh/ui/AutoRefreshStatusItem";
import { CommentOverlayStatusItem } from "src/features/comment-overlay/ui/CommentOverlayStatusItem";
import { useNextThreadSearch } from "src/features/next-thread/browser/use-next-thread-search";
import { NextThreadSearchDialog } from "src/features/next-thread/ui/NextThreadSearchDialog";
import { NgStatusProvider } from "src/features/ng/browser/use-ng-status";
import { NgStatusItem } from "src/features/ng/ui/NgStatusItem";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import { SharedTabBar } from "src/features/tabs/ui/SharedTabBar";
import { IkioiStatusItem } from "src/features/thread/ui/IkioiStatusItem";
import { PopularFilterStatusItem } from "src/features/thread/ui/PopularFilterStatusItem";
import { ThreadListLoadedStatusItem } from "src/features/thread-list/ui/ThreadListLoadedStatusItem";
import { ThreadListPanelToggleItem } from "src/features/thread-list/ui/ThreadListPanelToggleItem";
import { WritePanelToggleItem } from "src/features/write/ui/WritePanelToggleItem";
import { container } from "src/service-container/index";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { BottomPanelProvider } from "src/view/browser/hooks/use-bottom-panel";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { BottomPanel } from "src/view/browser/shell/BottomPanel";
import { ContentArea } from "src/view/browser/shell/ContentArea";
import { NavigationBar } from "src/view/browser/shell/NavigationBar";
import { PageCountStatusItem } from "src/view/browser/shell/PageCountStatusItem";
import { SidePanel } from "src/view/browser/shell/SidePanel";
import { TitleBar } from "src/view/browser/shell/TitleBar";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";
import {
  PaneProvider,
  useActivePaneId,
  useBottomPanelLayout,
  useTabDispatch,
  useTabStore,
  useWindowPanes,
} from "src/view/browser/state/tabs/use-tab-store";
import browser from "webextension-polyfill";

const logger = createLogger("view/browser");

// 1ペインの縦タブ表示でステータスバーを置く窓の最下段。複数ペインや未配置のときは null。
// 変更理由: ペイン内に置いたままだと縦タブバーが画面の下端まで伸びて、ステータスバーの左側を覆う。
// 状態は各ペインの StatusBarProvider に残し、表示先の DOM だけをこの最下段へ移す。
const StatusBarHostContext = createContext<HTMLElement | null>(null);

const PaneStatusBar: React.FC = () => {
  const host = useContext(StatusBarHostContext);
  const bar = <StatusBar />;
  return host ? createPortal(bar, host) : bar;
};

// MCPのURL省略要求とサービスワーカー用設定を保存する。
// TabStoreはReact Context内の状態なので、UI外のサービスワーカーへはこの最小限の値だけ渡す。
const ActiveThreadBridgeState: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { viewPage } = useTabStore();
  const activeThreadUrl = isActive && viewPage.type === "thread" ? viewPage.threadUrl : undefined;
  const format2chnet = container.config.get("format_2chnet");

  useEffect(() => {
    if (!/^(?:chrome|moz)-extension:$/.test(location.protocol) || !isActive) return;

    // 変更理由: サービスワーカーはwindowのReact状態を参照できないため、
    // URL省略要求に必要な現在スレッドだけを拡張ストレージへ同期する。
    const state = activeThreadUrl ?? null;
    void browser.runtime
      .sendMessage({
        type: "mcp-state",
        activeThreadUrl: state,
        format2chnet,
      })
      .catch((error: unknown) => {
        logger.error("現在スレッド情報の同期に失敗しました:", error);
      });
  }, [activeThreadUrl, format2chnet, isActive]);

  return null;
};

// 1ペイン分の縦カラム（タブバー＋ナビゲーション＋コンテンツ）。
// PaneProvider で囲うことで、配下の TabBar/ContentArea/各ページが自ペインのスライスを透過的に操作する。
const PaneColumn: React.FC<{ paneId: string; isActive: boolean }> = ({ paneId, isActive }) => {
  return (
    <PaneProvider paneId={paneId}>
      <PaneColumnInner isActive={isActive} />
    </PaneProvider>
  );
};

// PaneProvider 配下でしか使えない（ペインスコープの dispatch を取るため）。
const PaneColumnInner: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const dispatch = useTabDispatch();
  const { viewPage, viewTab, paneId } = useTabStore();
  const focusedPaneId = useActivePaneId();
  const isFocusedPane = isActive && paneId === focusedPaneId;
  const initialBottomPanel = useBottomPanelLayout(paneId);
  const tabBarOrientation = useTabBarOrientation();
  const {
    state: nextThreadSearchState,
    searchNextThread,
    searchRelatedThreads,
    close: closeNextThreadSearch,
    selectCandidate,
  } = useNextThreadSearch({
    viewPage,
    isActive,
    keepAutoRefresh: viewTab.autoRefreshEnabled,
    dispatch,
  });

  // 変更理由: 水平・垂直どちらの配置でもペイン内容は同一にするため、TabBar 以外の
  // 本体部分を共通化して二重管理を防ぐ。
  const openArchiveReplayWindow = useCallback(() => {
    if (!isTauriRuntime()) {
      // コマンド一覧から除外される以外の経路でも、ブラウザ版でTauri専用窓を開かない。
      logger.error("Tauri版以外から再生窓を開こうとしました");
      return;
    }
    // 変更理由: 再生中もThreadViewとコメントOverlayを同時に使うため、
    // Mainのペインへ埋め込まず、専用Tauri窓の表示だけを要求する。
    void openArchiveReplayNativeWindow().catch((error: unknown) => {
      logger.error("再生窓の表示に失敗しました", error);
    });
  }, []);
  const navigationBar = (
    <NavigationBar
      openNextThreadSearchDialog={searchNextThread}
      openRelatedThreadSearchDialog={searchRelatedThreads}
      openArchiveReplayWindow={openArchiveReplayWindow}
    />
  );
  const paneBody = (
    <>
      <ActiveThreadBridgeState isActive={isFocusedPane} />
      <ContentArea isOverlayTarget={isFocusedPane} onSearchRelatedThreads={searchRelatedThreads} />
      <BottomPanel />
      {/* コマンドとナビゲーションを同じオムニバーへ集約し、
          操作元のペイン状態を使うためアクティブペインだけが起動を担当する。 */}
      {isActive ? (
        <>
          <NextThreadSearchDialog
            state={nextThreadSearchState}
            onClose={closeNextThreadSearch}
            onSelect={selectCandidate}
          />
        </>
      ) : null}
      {/* 以下はこのペインの StatusBarProvider に項目を登録する。 */}
      <NgStatusItem />
      <IkioiStatusItem />
      <PopularFilterStatusItem />
      <AutoRefreshStatusItem />
      <CommentOverlayStatusItem isActive={isFocusedPane} />
      <PageCountStatusItem />
      <ThreadListLoadedStatusItem />
      <ThreadListPanelToggleItem />
      <WritePanelToggleItem />
      <PaneStatusBar />
    </>
  );

  return (
    <section
      className="pane-column"
      data-workspace-pane-id={paneId}
      data-active={isActive ? "true" : "false"}
      data-tab-orientation={tabBarOrientation}
      // ペイン内のどこかを操作したらそのペインをフォーカスする。
      // capture フェーズで拾い、子要素の操作前にアクティブペインを確定させる。
      onPointerDownCapture={() => {
        if (!isActive) {
          dispatch(tabActions.setActivePane());
        }
      }}
    >
      {/*
        ステータス／NG／書き込みパネル／自動スクロールの各状態をペイン単位に分離する。
        これらのプロバイダをペイン内に降ろすことで、2ペイン時に左右それぞれが
        独立したステータスバーと書き込みパネルを持てるようにする（旧構成はシェル直下に
        1個だけ置き、アクティブペインの情報しか映せなかった）。
        StatusBar の項目登録は固定 ID なので、プロバイダがペイン単位になることで
        左右の項目衝突も自然に解消される。
      */}
      <StatusBarProvider>
        <PageCountStatusProvider>
          <NgStatusProvider>
            <BottomPanelProvider
              layout={initialBottomPanel}
              onLayoutChange={(patch) =>
                dispatch({
                  type: TAB_ACTION_TYPES.UPDATE_BOTTOM_PANEL,
                  targetPaneId: paneId,
                  patch,
                })
              }
            >
              <AutoScrollStateProvider paneId={paneId}>
                {/* 全ペイン共通の縦タブバーを窓の左端に置く。 */}
                <div className="pane-column__chrome">{navigationBar}</div>
                {paneBody}
              </AutoScrollStateProvider>
            </BottomPanelProvider>
          </NgStatusProvider>
        </PageCountStatusProvider>
      </StatusBarProvider>
    </section>
  );
};

// ペイン群を横に並べる行。
const PaneRow: React.FC = () => {
  const { panes, activePaneId } = useWindowPanes();

  return (
    <div className="pane-row">
      {panes.map((pane) => (
        <PaneColumn key={pane.id} paneId={pane.id} isActive={pane.id === activePaneId} />
      ))}
    </div>
  );
};

// タイトルバーとワークスペースの枠。1ペインの垂直モードでは、左端のタブバーを
// タイトルバーの上端まで伸ばし、タイトルバー以下を右へ押しのける。
export const WindowShell: React.FC<{ showSidePanel?: boolean }> = ({ showSidePanel = true }) => {
  const { activePaneId, panes } = useWindowPanes();
  const [statusBarSlot, setStatusBarSlot] = useState<HTMLElement | null>(null);
  const dispatch = useTabDispatch();
  const { window: viewWindow } = useViewSurface();
  useEffect(() => {
    // 窓を前面に戻したときは、その窓で最後に選んだペインを全体の操作先へ戻す。
    const onFocus = () =>
      dispatch({ type: TAB_ACTION_TYPES.SET_ACTIVE_PANE, paneId: activePaneId });
    viewWindow.addEventListener("focus", onFocus);
    return () => viewWindow.removeEventListener("focus", onFocus);
  }, [viewWindow, dispatch, activePaneId]);
  const main = (
    <>
      <TitleBar showSidePanel={showSidePanel} />
      <div className="browser-shell__workspace">
        <PaneRow />
        {showSidePanel ? <SidePanel /> : null}
      </div>
    </>
  );

  return (
    <StatusBarHostContext.Provider value={panes.length === 1 ? statusBarSlot : null}>
      <div className="browser-shell__vertical-frame">
        <div className="browser-shell__vertical-row">
          <SharedTabBar orientation="vertical" />
          <div className="browser-shell__vertical-main">{main}</div>
        </div>
        {/* 1ペインのときだけ中身が入り、空のときは高さを取らない。 */}
        <div ref={setStatusBarSlot} className="browser-shell__status-slot" />
      </div>
    </StatusBarHostContext.Provider>
  );
};

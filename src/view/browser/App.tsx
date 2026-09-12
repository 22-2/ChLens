import { List as ListIcon, PenLine } from "lucide-react";
import React, { useEffect } from "react";
import { container } from "src/service-container/index";
import { AutoRefreshStatusItem } from "src/view/browser/components/AutoRefreshStatusItem";
import { BookmarkRootSelectorDialog } from "src/view/browser/components/BookmarkRootSelectorDialog";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { CommentOverlayStatusItem } from "src/view/browser/components/CommentOverlayStatusItem";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { IkioiStatusItem } from "src/view/browser/components/IkioiStatusItem";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { NextThreadSearchDialog } from "src/view/browser/components/NextThreadSearchDialog";
import { NgStatusItem } from "src/view/browser/components/NgStatusItem";
import { PopularFilterStatusItem } from "src/view/browser/components/PopularFilterStatusItem";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBar, StatusBarItem, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { TitleBar } from "src/view/browser/components/TitleBar";
import { AutoScrollStateProvider } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  BottomPanelProvider,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useNextThreadSearch } from "src/view/browser/hooks/use-next-thread-search";
import { NgStatusProvider } from "src/view/browser/hooks/use-ng-status";
import { useNotificationListener } from "src/view/browser/hooks/use-notification-listener";
import { useTabBarOrientation } from "src/view/browser/hooks/use-tab-bar-orientation";
import {
  PaneProvider,
  TabProvider,
  useTabDispatch,
  useTabPanes,
  useTabStore,
} from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";
import {
  UrlBarVisibilityProvider,
  useUrlBarVisibility,
} from "src/view/browser/hooks/use-url-bar-visibility";
import { ToastProvider } from "src/view/browser/ui/Toast";
import { TooltipProvider } from "src/view/browser/ui/Tooltip";
import { applyBBSMenuToItestServerMap } from "src/view/browser/utils/itest-server-map";
import browser from "webextension-polyfill";

// ステータスバー右端に表示する下部パネルの直接操作ボタン。
// 変更理由: パネル種別を先に選ばせると書き込みまでの操作が増えるため、
// スレ一覧と書き込みをそれぞれ1クリックで開けるようにする。
const ThreadListPanelToggleItem: React.FC = () => {
  const { togglePanel } = useBottomPanel();
  const { currentPage } = useTabStore();

  if (currentPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="thread-list-panel-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.threadListPanelToggle}
      interactive
      title="スレ一覧パネルを開閉"
    >
      <button
        className="status-bar__btn"
        onClick={() => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID)}
        aria-label="スレ一覧パネルを開閉"
      >
        <ListIcon size={12} />
        <span>スレ一覧</span>
      </button>
    </StatusBarItem>
  );
};

// MCPのURL省略要求とサービスワーカー用設定を保存する。
// TabStoreはReact Context内の状態なので、UI外のサービスワーカーへはこの最小限の値だけ渡す。
const ActiveThreadBridgeState: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const { currentPage } = useTabStore();
  const activeThreadUrl =
    isActive && currentPage.type === "thread" ? currentPage.threadUrl : undefined;
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
        console.error("[ChLens MCP] 現在スレッド情報の同期に失敗しました:", error);
      });
  }, [activeThreadUrl, format2chnet, isActive]);

  return null;
};

const WritePanelToggleItem: React.FC = () => {
  const { togglePanel } = useBottomPanel();
  const { currentPage } = useTabStore();

  // 書き込み UI はスレッド専用なので、他ページではステータスバーに出さない。
  if (currentPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="write-panel-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.writePanelToggle}
      interactive
      title="書き込みパネルを開閉"
    >
      <button
        className="status-bar__btn"
        onClick={() => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID)}
        aria-label="書き込みパネルを開閉"
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
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
  const { currentPage, activeTab } = useTabStore();
  const tabBarOrientation = useTabBarOrientation();
  const {
    state: nextThreadSearchState,
    searchNextThread,
    close: closeNextThreadSearch,
    selectCandidate,
  } = useNextThreadSearch({
    currentPage,
    isActive,
    keepAutoRefresh: activeTab.autoRefreshEnabled,
    dispatch,
  });

  // 変更理由: 水平・垂直どちらの配置でもペイン内容は同一にするため、TabBar 以外の
  // 本体部分を共通化して二重管理を防ぐ。
  const navigationBar = <NavigationBar openNextThreadSearchDialog={searchNextThread} />;
  const paneBody = (
    <>
      <ActiveThreadBridgeState isActive={isActive} />
      <ContentArea isOverlayTarget={isActive} />
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
      <CommentOverlayStatusItem isActive={isActive} />
      <ThreadListPanelToggleItem />
      <WritePanelToggleItem />
      <StatusBar />
    </>
  );

  return (
    <section
      className="pane-column"
      data-active={isActive ? "true" : "false"}
      data-tab-orientation={tabBarOrientation}
      // ペイン内のどこかを操作したらそのペインをフォーカスする。
      // capture フェーズで拾い、子要素の操作前にアクティブペインを確定させる。
      onPointerDownCapture={() => {
        if (!isActive) {
          dispatch({ type: "SET_ACTIVE_PANE" });
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
        <NgStatusProvider>
          <BottomPanelProvider>
            <AutoScrollStateProvider>
              {tabBarOrientation === "vertical" ? (
                // 変更理由: 垂直モードではタブバーをペインの上端まで伸ばし、
                // タイトルバー以下を右へ押しのける。タイトルバーもペイン単位にし、
                // 自ペインの操作欄を持つ。1ペイン優先の簡易対応とし、
                // 2ペイン時は操作欄が複製される。
                <div className="pane-column__vertical-body">
                  <TabBar orientation="vertical" />
                  <div className="pane-column__vertical-main">
                    <TitleBar />
                    <div className="pane-column__chrome">{navigationBar}</div>
                    {paneBody}
                  </div>
                </div>
              ) : (
                <>
                  <div className="pane-column__chrome">
                    <TabBar orientation="horizontal" />
                    {navigationBar}
                  </div>
                  {paneBody}
                </>
              )}
            </AutoScrollStateProvider>
          </BottomPanelProvider>
        </NgStatusProvider>
      </StatusBarProvider>
    </section>
  );
};

// ペイン群を横に並べる行。
const PaneRow: React.FC = () => {
  const { panes, activePaneId } = useTabPanes();

  return (
    <div className="pane-row">
      {panes.map((pane) => (
        <PaneColumn key={pane.id} paneId={pane.id} isActive={pane.id === activePaneId} />
      ))}
    </div>
  );
};

const BrowserAppContent: React.FC = () => {
  const theme = useTheme();
  // 変更理由: 垂直モードではタイトルバーをペイン単位にするため、シェル側の共通表示を切り替える。
  const shellTabBarOrientation = useTabBarOrientation();
  useNotificationListener();
  const { isAnyExpanded: isUrlBarExpanded } = useUrlBarVisibility();

  // itest（携帯版）URLを実サーバーへ変換するための対応表を bbsmenu から構築する。
  // 前回セッションの localStorage キャッシュがあるため、ここでの取得は
  // 次回以降の起動に備えた更新も兼ねる。
  useEffect(() => {
    void container.bbsMenu
      .get(false)
      .then((result) => {
        if (result.status === "success" && result.menu) {
          applyBBSMenuToItestServerMap(result.menu);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider>
      <TabProvider>
        {/*
          ステータス／NG／書き込み／自動スクロールの各プロバイダは PaneColumn 内へ移設した。
          シェル直下には全ペイン共通のグローバル UI（トースト・ダイアログ）だけを残す。
        */}
        {/* data-theme を使ってダークモード CSS 変数を切り替える */}
        <div
          className="browser-shell"
          data-theme={theme}
          data-tab-orientation={shellTabBarOrientation}
        >
          <ToastProvider topOffset={isUrlBarExpanded ? "88px" : "64px"} rightOffset="78px" />
          {/*
            水平モードではタイトルと必須のレイアウト操作はペインの外に置く。
            これにより2ペイン時も操作が重複せず、アクティブペインのタイトルだけを表示できる。
            垂直モードではタイトルバーもペイン単位にするため、共通バーは表示しない。
          */}
          {shellTabBarOrientation === "vertical" ? null : <TitleBar />}
          <PaneRow />
          <BookmarkRootSelectorDialog />
        </div>
      </TabProvider>
    </TooltipProvider>
  );
};

export const BrowserApp: React.FC = () => (
  <UrlBarVisibilityProvider>
    <BrowserAppContent />
  </UrlBarVisibilityProvider>
);

import { MantineProvider, createTheme } from "@mantine/core";
import { PenLine } from "lucide-react";
import React from "react";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import { AutoRefreshStatusItem } from "src/view/browser/components/AutoRefreshStatusItem";
import { BookmarkRootSelectorDialog } from "src/view/browser/components/BookmarkRootSelectorDialog";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { IkioiStatusItem } from "src/view/browser/components/IkioiStatusItem";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { NgStatusItem } from "src/view/browser/components/NgStatusItem";
import {
  StatusBar,
  StatusBarItem,
  StatusBarProvider,
} from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { AutoScrollStateProvider } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  BottomPanelProvider,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { NgStatusProvider } from "src/view/browser/hooks/use-ng-status";
import { useNotificationListener } from "src/view/browser/hooks/use-notification-listener";
import {
  PaneProvider,
  TabProvider,
  useTabDispatch,
  useTabPanes,
  useTabStore,
} from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";

const mantineTheme = createTheme({
  fontFamily: '"Noto Sans JP", "Yu Gothic UI", sans-serif',
  defaultRadius: "md",
  primaryColor: "blue",
});

// ステータスバー左端に常設される書き込みパネル開閉ボタン
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
      // title={isOpen ? "書き込みパネルを閉じる" : "書き込みパネルを開く"}
    >
      <button
        className={`status-bar__btn`}
        onClick={() => togglePanel("write")}
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
};

// 1ペイン分の縦カラム（タブバー＋ナビゲーション＋コンテンツ）。
// PaneProvider で囲うことで、配下の TabBar/ContentArea/各ページが自ペインのスライスを透過的に操作する。
const PaneColumn: React.FC<{ paneId: string; isActive: boolean }> = ({
  paneId,
  isActive,
}) => {
  return (
    <PaneProvider paneId={paneId}>
      <PaneColumnInner isActive={isActive} />
    </PaneProvider>
  );
};

// PaneProvider 配下でしか使えない（ペインスコープの dispatch を取るため）。
const PaneColumnInner: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const dispatch = useTabDispatch();

  return (
    <section
      className="pane-column"
      data-active={isActive ? "true" : "false"}
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
              <div className="pane-column__chrome">
                <TabBar />
                <NavigationBar />
              </div>
              <ContentArea />
              <BottomPanel />
              {/* 以下はこのペインの StatusBarProvider に項目を登録する。 */}
              <NgStatusItem />
              <IkioiStatusItem />
              <AutoRefreshStatusItem />
              <WritePanelToggleItem />
              <StatusBar />
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
        <PaneColumn
          key={pane.id}
          paneId={pane.id}
          isActive={pane.id === activePaneId}
        />
      ))}
    </div>
  );
};

export const BrowserApp: React.FC = () => {
  const theme = useTheme();
  useNotificationListener();

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={theme === "dark" ? "dark" : "light"}
    >
      <TabProvider>
        {/*
          ステータス／NG／書き込み／自動スクロールの各プロバイダは PaneColumn 内へ移設した。
          シェル直下には全ペイン共通のグローバル UI（トースト・ダイアログ）だけを残す。
        */}
        {/* data-theme を使ってダークモード CSS 変数を切り替える */}
        <div className="browser-shell" data-theme={theme}>
          <Toaster
            position="top-right"
            theme={theme === "dark" ? "dark" : "light"}
            offset={{
              top: "88px",
              right: "78px",
            }}
            toastOptions={{
              style: {
                fontSize: "12px",
                padding: "8px 12px",
                minHeight: "auto",
                width: "fit-content",
              },
            }}
            duration={1500}
            closeButton
          />
          <PaneRow />
          <BookmarkRootSelectorDialog />
        </div>
      </TabProvider>
    </MantineProvider>
  );
};

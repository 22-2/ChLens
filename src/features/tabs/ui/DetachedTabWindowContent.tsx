import { PenLine } from "lucide-react";
import React, { type ReactNode, useMemo } from "react";
import { AutoScrollStateProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { AutoRefreshStatusItem } from "src/features/auto-refresh/ui/AutoRefreshStatusItem";
import {
  type ViewSurface,
  ViewSurfaceProvider,
} from "src/features/auxiliary-window/browser/use-view-surface";
import { CommentOverlayStatusItem } from "src/features/comment-overlay/ui/CommentOverlayStatusItem";
import { NgStatusProvider } from "src/features/ng/browser/use-ng-status";
import { NgStatusItem } from "src/features/ng/ui/NgStatusItem";
import { PaneProvider, useTabStore } from "src/features/tabs/browser/use-tab-store";
import { TabViewScopeProvider } from "src/features/tabs/browser/use-tab-view-scope";
import { TabPanel } from "src/features/tabs/ui/TabView";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { IkioiStatusItem } from "src/features/thread/ui/IkioiStatusItem";
import { PopularFilterStatusItem } from "src/features/thread/ui/PopularFilterStatusItem";
import { useWriteSessionControls } from "src/features/write/browser/use-write-session";
import { PageCountStatusItem } from "src/view/browser/components/PageCountStatusItem";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBar, StatusBarItem, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TitleBar } from "src/view/browser/components/TitleBar";
import { PageCountStatusProvider } from "src/view/browser/hooks/use-page-count-status";
import type { Tab } from "src/view/browser/types";
import { ToastProvider } from "src/view/browser/ui/Toast";

/**
 * 切り離したタブ1枚分の別窓内UI。
 *
 * 変更理由: 窓のライフサイクル管理(TabWindowHost)と、別窓の中身の組み立てが
 * 同じファイルにあると、ステータス項目の追加だけでも窓管理の差分に埋もれるため分離した。
 */
export const DetachedTabWindowContent: React.FC<{
  tab: Tab;
  paneId: string;
  surface: ViewSurface;
}> = ({ tab, paneId, surface }) => (
  <TabViewScopeProvider scope={{ paneId, tabId: tab.id }}>
    <PaneProvider paneId={paneId}>
      <StatusBarProvider>
        <PageCountStatusProvider>
          <NgStatusProvider>
            <AutoScrollStateProvider>
              <TabWindowSurface surface={surface}>
                <WindowNavigationBridge tabId={tab.id} manageBrowserHistory={false} />
                {/* 別窓内の返信・別窓生成失敗などの通知を、表示中の窓へ出す。 */}
                <ToastProvider topOffset="16px" rightOffset="16px" />
                {/* 表示タブをContextで固定し、元ペインの選択変更に影響されない共通タイトルを出す。 */}
                <TitleBar />
                <div className="content-area">
                  <TabPanel tab={tab} isActive isOverlayTarget={false} viewSurface={surface} />
                </div>
                <NgStatusItem />
                <IkioiStatusItem />
                <PopularFilterStatusItem />
                <AutoRefreshStatusItem />
                <CommentOverlayStatusItem isActive />
                <PageCountStatusItem />
                <TabWindowWriteStatusItem />
                <StatusBar />
              </TabWindowSurface>
            </AutoScrollStateProvider>
          </NgStatusProvider>
        </PageCountStatusProvider>
      </StatusBarProvider>
    </PaneProvider>
  </TabViewScopeProvider>
);

const TabWindowWriteStatusItem: React.FC = () => {
  const { viewPage } = useTabStore();
  const { openWriteWindow, selectThread } = useWriteSessionControls();

  if (viewPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="detached-write-window-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.writePanelToggle}
      interactive
      title="書き込み窓を開く"
    >
      <button
        type="button"
        className="status-bar__btn"
        onClick={() => {
          // 別窓では下部パネルを開かず、常に共有の書き込み窓へ表示中スレを渡す。
          selectThread(viewPage.threadUrl);
          openWriteWindow();
        }}
        aria-label="書き込み窓を開く"
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
};

const TabWindowSurface: React.FC<{
  surface: ViewSurface;
  children: ReactNode;
}> = ({ surface, children }) => {
  // 窓ごとに同一のsurfaceオブジェクトを渡し、ページ内のイベント購読を不要に解除しない。
  const { document: surfaceDocument, window: surfaceWindow } = surface;
  const stableSurface = useMemo(
    () => ({ document: surfaceDocument, window: surfaceWindow }),
    [surfaceDocument, surfaceWindow],
  );
  return <ViewSurfaceProvider surface={stableSurface}>{children}</ViewSurfaceProvider>;
};

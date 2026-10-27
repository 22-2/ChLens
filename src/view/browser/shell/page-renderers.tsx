import type { ReactNode, RefObject } from "react";
import { BoardListPage } from "src/view/browser/pages/BoardListPage";
import { BookmarkListPage } from "src/view/browser/pages/BookmarkListPage";
import { HistoryListPage } from "src/view/browser/pages/HistoryListPage";
import { HomeTabPage } from "src/view/browser/pages/HomeTabPage";
import { LogListPage } from "src/view/browser/pages/LogListPage";
import { SettingsPage } from "src/view/browser/pages/SettingsPage";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { ThreadPage } from "src/view/browser/pages/ThreadPage";
import { WriteHistoryListPage } from "src/view/browser/pages/WriteHistoryListPage";
import { isAutoRefreshEnabledForPage } from "src/view/browser/state/tabs/auto-refresh-pages";
import type { Page, PageType, Tab } from "src/view/browser/types";

type PageOfType<Type extends PageType> = Extract<Page, { type: Type }>;

export interface PageRenderContext {
  tab: Tab;
  isActive: boolean;
  isOverlayTarget: boolean;
  threadListActive?: boolean;
  onSearchRelatedThreads?: () => Promise<void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

type PageRenderer = (page: Page, context: PageRenderContext) => ReactNode;

function definePageRenderer<Type extends PageType>(
  type: Type,
  render: (page: PageOfType<Type>, context: PageRenderContext) => ReactNode,
): PageRenderer {
  return (page, context) => {
    if (page.type !== type) {
      throw new Error("ページ描画定義の種別が一致しません: " + type);
    }
    return render(page as PageOfType<Type>, context);
  };
}

function shouldStartThreadAutoRefreshAtBottom(tab: Tab, page: PageOfType<"thread">): boolean {
  if (!isAutoRefreshEnabledForPage(tab, page) || tab.currentIndex === 0) {
    return false;
  }

  // 変更理由: FOLLOW_NEXT_THREAD だけが自動更新の束縛を次のスレへ引き継ぐため、
  // 直前もスレッドなら新スレ表示直後の最下部同期が必要な遷移と判定できる。
  return tab.history[tab.currentIndex - 1]?.type === "thread";
}

const PAGE_RENDERERS: Record<PageType, PageRenderer> = {
  home: definePageRenderer("home", () => <HomeTabPage />),
  // 旧セッションに残る空タブも同じホームへ描画し、入口画面を一つに保つ。
  newTab: definePageRenderer("newTab", () => <HomeTabPage />),
  boardList: definePageRenderer("boardList", (_page, context) => (
    <BoardListPage
      tabId={context.tab.id}
      isActive={context.isActive}
      refreshKey={context.tab.reloadKey}
    />
  )),
  threadList: definePageRenderer("threadList", (page, context) => (
    <ThreadListPage
      tabId={context.tab.id}
      tab={context.tab}
      page={page}
      refreshKey={context.tab.reloadKey}
      isActive={context.threadListActive ?? false}
      isAutoRefreshEnabled={isAutoRefreshEnabledForPage(context.tab, page)}
      scrollContainerRef={context.scrollContainerRef}
    />
  )),
  thread: definePageRenderer("thread", (page, context) => (
    <ThreadPage
      tabId={context.tab.id}
      tab={context.tab}
      page={page}
      refreshKey={context.tab.reloadKey}
      isActive={context.isActive}
      isOverlayTarget={context.isOverlayTarget}
      isAutoRefreshEnabled={isAutoRefreshEnabledForPage(context.tab, page)}
      startAutoRefreshAtBottom={shouldStartThreadAutoRefreshAtBottom(context.tab, page)}
      onSearchRelatedThreads={context.onSearchRelatedThreads}
      scrollContainerRef={context.scrollContainerRef}
    />
  )),
  settings: definePageRenderer("settings", (page, context) => (
    <SettingsPage tabId={context.tab.id} page={page} />
  )),
  // isActive を渡し、ページ内部のストア全体購読による不要な再レンダリングを避ける。
  bookmarkList: definePageRenderer("bookmarkList", (_page, context) => (
    <BookmarkListPage tabId={context.tab.id} isActive={context.isActive} />
  )),
  historyList: definePageRenderer("historyList", (_page, context) => (
    <HistoryListPage
      tabId={context.tab.id}
      isActive={context.isActive}
      refreshKey={context.tab.reloadKey}
    />
  )),
  writeHistoryList: definePageRenderer("writeHistoryList", (_page, context) => (
    <WriteHistoryListPage
      tabId={context.tab.id}
      isActive={context.isActive}
      refreshKey={context.tab.reloadKey}
    />
  )),
  logList: definePageRenderer("logList", (_page, context) => (
    <LogListPage
      tabId={context.tab.id}
      isActive={context.isActive}
      refreshKey={context.tab.reloadKey}
    />
  )),
};

export function renderPage(page: Page, context: PageRenderContext): ReactNode {
  return PAGE_RENDERERS[page.type](page, context);
}

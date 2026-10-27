import { memo, type RefObject, useEffect, useRef, useState } from "react";
import { registerPageTarget } from "src/view/browser/extension/page-actions";
import { type ViewSurface, ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { getPageRenderKey, getPageViewStateKey } from "src/view/browser/page-type-definitions";
import { renderPage } from "src/view/browser/shell/page-renderers";
import { TabErrorBoundary } from "src/view/browser/shell/TabErrorBoundary";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

interface TabPageContentProps {
  tab: Tab;
  isActive: boolean;
  isOverlayTarget: boolean;
  threadListActive?: boolean;
  onSearchRelatedThreads?: () => Promise<void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

const TabPageContent = memo(function TabPageContent({
  tab,
  isActive,
  isOverlayTarget,
  threadListActive,
  onSearchRelatedThreads,
  scrollContainerRef,
}: TabPageContentProps) {
  const page = getCurrentPage(tab);
  return renderPage(page, {
    tab,
    isActive,
    isOverlayTarget,
    threadListActive,
    onSearchRelatedThreads,
    scrollContainerRef,
  });
});

export interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
  isOverlayTarget: boolean;
  onSearchRelatedThreads?: () => Promise<void>;
  viewSurface?: ViewSurface;
}

/**
 * タブ1枚分の表示とライフサイクルを管理する。
 *
 * 変更理由: ContentAreaがタブ一覧の選択だけを担当し、タブ本体を独立した表示単位に
 * することで、将来メイン領域以外へ同じタブを表示するときも状態保持の規則を共有できる。
 */
export const TabPanel = memo(function TabPanel({
  tab,
  isActive,
  isOverlayTarget,
  onSearchRelatedThreads,
  viewSurface,
}: TabPanelProps) {
  const page = getCurrentPage(tab);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const targetWindow = viewSurface?.window ?? window;
  useEffect(() => {
    if (!isActive) return;
    return registerPageTarget(targetWindow, tab.id);
  }, [isActive, tab.id, targetWindow]);

  // パフォーマンス向上とメモリ節約のため、バックグラウンドで開かれたタブ（まだ一度も表示されていないタブ）は
  // 初回表示（アクティブ化）されるまでDOMのマウントおよびレンダリングを遅延させる。
  const [hasRendered, setHasRendered] = useState(isActive);

  useEffect(() => {
    if (isActive && !hasRendered) {
      setHasRendered(true);
    }
  }, [isActive, hasRendered]);

  if (!hasRendered && !isActive) {
    return null;
  }

  const panel = (
    <div
      data-tab-panel-id={tab.id}
      ref={scrollContainerRef}
      data-active={isActive ? "true" : "false"}
      className="content-area__tab-panel"
      style={{ display: isActive ? "block" : "none" }}
    >
      {
        // display 切替で DOM/scroll を残しつつ、
        // ページ本体はタブ自身が変わった時だけ再実行させる。
        // 変更理由: 1タブの描画例外で画面全体を止めないよう、タブ単位で受け止める。
        // ページが変わったら境界もリセットし、閉じる導線を残さない。
        <TabErrorBoundary
          key={getPageRenderKey(tab.id, tab.currentIndex, page)}
          tabId={tab.id}
          pageKey={getPageViewStateKey(page)}
        >
          <TabPageContent
            tab={tab}
            isActive={isActive}
            isOverlayTarget={isOverlayTarget && isActive}
            threadListActive={page.type === "threadList" ? isActive : undefined}
            onSearchRelatedThreads={onSearchRelatedThreads}
            scrollContainerRef={scrollContainerRef}
          />
        </TabErrorBoundary>
      }
    </div>
  );

  return viewSurface ? (
    <ViewSurfaceProvider surface={viewSurface}>{panel}</ViewSurfaceProvider>
  ) : (
    panel
  );
});

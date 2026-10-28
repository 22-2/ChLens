import { X } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAutoScrollState } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { useDetachedTabController } from "src/features/tabs/browser/use-detached-tab-controller";
import { ThreadListPanel } from "src/features/thread-list/ui/ThreadListPanel";
import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import {
  BOTTOM_PANEL_MAX_HEIGHT,
  BOTTOM_PANEL_MIN_HEIGHT,
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { useResizeHandle } from "src/view/browser/hooks/use-resize-handle";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { getResizeObserverForWindow, isHTMLElementInWindow } from "src/view/browser/utils/dom";

interface BottomPanelProps {
  /**
   * 切り離したタブ自身の別窓の中に置かれたパネルか。
   *
   * 変更理由: 本窓のパネルは、表示中のタブが別窓へ移ったら操作対象を失うため閉じる。
   * 一方、別窓内のパネルは固定された自タブ(常に切り離し中)を操作するので、
   * 同じ判定を使うと開いた直後に閉じてしまう。
   */
  hostedInTabWindow?: boolean;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ hostedInTabWindow = false }) => {
  const { viewTab, viewPage } = useTabStore();
  const { isDetachedTab } = useDetachedTabController();
  // 変更理由: 下部パネルを別窓へ移しても、開閉直後の追従を
  // 元のWindowへ登録しないよう、表示先のイベント境界を揃える。
  const { window: viewWindow, document: viewDocument } = useViewSurface();
  const { canAutoScroll } = useAutoScrollState();
  const { isOpen, height, activePanelTabId, tabs, closePanel, setHeight, setActivePanelTab } =
    useBottomPanel();

  const rootRef = useRef<HTMLDivElement>(null);
  const [sideOverlap, setSideOverlap] = useState(0);
  const wasOpenRef = useRef(false);
  const canAutoScrollWhenClosedRef = useRef(canAutoScroll);

  useEffect(() => {
    // スレ一覧・書き込みのどちらも現在スレを操作対象にするため、別ページへ移動したら
    // 下部パネルを閉じて、板・スレの文脈がない状態で誤操作できないようにする。
    if (
      isOpen &&
      (viewPage.type !== "thread" || (!hostedInTabWindow && isDetachedTab(viewTab.id)))
    ) {
      closePanel();
    }
  }, [closePanel, hostedInTabWindow, isDetachedTab, isOpen, viewPage.type, viewTab.id]);

  useEffect(() => {
    if (!isOpen) {
      canAutoScrollWhenClosedRef.current = canAutoScroll;
    }
  }, [canAutoScroll, isOpen]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    const justOpened = !wasOpen && isOpen;
    if (
      !justOpened ||
      viewPage.type !== "thread" ||
      activePanelTabId !== BOTTOM_PANEL_WRITE_TAB_ID
    ) {
      return;
    }

    if (!canAutoScroll && !canAutoScrollWhenClosedRef.current) {
      return;
    }

    // 2ペイン時は data-active な tab-panel が左右に1個ずつ存在するため、
    // document 全体ではなく自ペイン（.pane-column）配下に限定して、
    // 他ペインのスレッドを誤ってスクロールしないようにする。
    const scope = rootRef.current?.closest(".pane-column") ?? viewDocument;
    const activePanel = scope.querySelector(".content-area__tab-panel[data-active='true']");
    if (!isHTMLElementInWindow(activePanel, viewWindow)) {
      return;
    }

    const stickToBottom = () => {
      // 「線より下にいる時にパネルを開いた」ケースでは、
      // 直前まで見ていた最下部コンテキストを維持するため末尾へ寄せる。
      activePanel.scrollTop = activePanel.scrollHeight;
    };

    stickToBottom();
    const rafId = viewWindow.requestAnimationFrame(stickToBottom);
    return () => {
      viewWindow.cancelAnimationFrame(rafId);
    };
  }, [activePanelTabId, canAutoScroll, isOpen, viewDocument, viewPage.type, viewWindow]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const workspace = root?.closest(".browser-shell__workspace");
    const parent = root?.parentElement;
    if (!root || !workspace || !parent || !isOpen) return;
    let side: Element | null = null;
    const update = () => {
      const area = parent.getBoundingClientRect();
      const panel = root.getBoundingClientRect();
      const other = side?.getBoundingClientRect();
      const overlap =
        other &&
        other.left < area.right &&
        other.right > area.left &&
        other.top < panel.bottom &&
        other.bottom > panel.top
          ? Math.max(0, area.right - Math.max(area.left, other.left))
          : 0;
      setSideOverlap((previous) => (previous === overlap ? previous : overlap));
    };
    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const resizeObserver = ResizeObserverConstructor ? new ResizeObserverConstructor(update) : null;
    resizeObserver?.observe(parent);
    resizeObserver?.observe(root);
    const observeSide = () => {
      const next = workspace.querySelector(":scope > .side-panel");
      if (side !== next) {
        if (side) resizeObserver?.unobserve(side);
        side = next;
        if (side) resizeObserver?.observe(side);
      }
      update();
    };
    // サイドパネルは本文に重なって開くため、下部パネルの操作だけ内側へ避ける。
    const MutationObserverConstructor = (viewWindow as Window & typeof globalThis).MutationObserver;
    const mutationObserver = new MutationObserverConstructor(observeSide);
    mutationObserver.observe(workspace, { childList: true });
    viewWindow.addEventListener("resize", update);
    observeSide();
    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      viewWindow.removeEventListener("resize", update);
    };
  }, [isOpen, viewWindow]);

  const resize = useResizeHandle({
    value: height,
    min: BOTTOM_PANEL_MIN_HEIGHT,
    max: BOTTOM_PANEL_MAX_HEIGHT,
    axis: "y",
    // 画面の下端に置くため、上へ引くほど高くなる。
    direction: -1,
    keyboardStep: 20,
    onCommit: setHeight,
  });

  if (!isOpen || viewPage.type !== "thread") return null;

  return (
    <div
      ref={rootRef}
      className={`bottom-panel${activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID ? " bottom-panel--write" : ""}`}
      style={{
        marginRight: sideOverlap,
        ...(activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID ? {} : { height: resize.size }),
      }}
    >
      {activePanelTabId !== BOTTOM_PANEL_WRITE_TAB_ID && (
        <div
          className="bottom-panel__resize-handle"
          aria-label="下部パネルの高さ"
          title="ドラッグしてサイズを変更"
          {...resize.handleProps}
        />
      )}

      {/* タブストリップ */}
      <div className="bottom-panel__header">
        <div className="bottom-panel__tab-strip" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activePanelTabId === tab.id}
              className={`bottom-panel__tab${
                activePanelTabId === tab.id ? " bottom-panel__tab--active" : ""
              }`}
              onClick={() => setActivePanelTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bottom-panel__header-actions">
          <button
            className="bottom-panel__icon-btn icon-button"
            onClick={closePanel}
            title="パネルを閉じる"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="bottom-panel__body" role="tabpanel">
        {activePanelTabId === BOTTOM_PANEL_THREAD_LIST_TAB_ID && (
          <ThreadListPanel threadUrl={viewPage.threadUrl} />
        )}
        {activePanelTabId === BOTTOM_PANEL_WRITE_TAB_ID && <WritePanelContent />}
      </div>
    </div>
  );
};

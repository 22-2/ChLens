import { X } from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

export const BottomPanel: React.FC = () => {
  const { currentPage } = useTabStore();
  const { canAutoScroll } = useAutoScrollState();
  const {
    isOpen,
    height,
    activeTabId,
    tabs,
    closePanel,
    setHeight,
    setActiveTab,
  } = useBottomPanel();

  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(height);
  const wasOpenRef = useRef(false);
  const canAutoScrollWhenClosedRef = useRef(canAutoScroll);

  useEffect(() => {
    // 書き込みパネルはスレッド URL を前提にしているため、別ページへ移動したら閉じて状態を揃える。
    if (isOpen && currentPage.type !== "thread") {
      closePanel();
    }
  }, [closePanel, currentPage.type, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      canAutoScrollWhenClosedRef.current = canAutoScroll;
    }
  }, [canAutoScroll, isOpen]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    const justOpened = !wasOpen && isOpen;
    if (!justOpened || currentPage.type !== "thread") {
      return;
    }

    if (!canAutoScroll && !canAutoScrollWhenClosedRef.current) {
      return;
    }

    const activePanel = document.querySelector(
      ".content-area__tab-panel[data-active='true']",
    );
    if (!(activePanel instanceof HTMLElement)) {
      return;
    }

    const stickToBottom = () => {
      // 「線より下にいる時にパネルを開いた」ケースでは、
      // 直前まで見ていた最下部コンテキストを維持するため末尾へ寄せる。
      activePanel.scrollTop = activePanel.scrollHeight;
    };

    stickToBottom();
    const rafId = window.requestAnimationFrame(stickToBottom);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [canAutoScroll, currentPage.type, isOpen]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartHeight.current = height;

      const onMouseMove = (ev: MouseEvent) => {
        if (dragStartY.current === null) return;
        // ハンドルを上に動かすほど高さが増える
        const delta = dragStartY.current - ev.clientY;
        setHeight(dragStartHeight.current + delta);
      };

      const onMouseUp = () => {
        dragStartY.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [height, setHeight],
  );

  if (!isOpen || currentPage.type !== "thread") return null;

  return (
    <div className="bottom-panel" style={{ height }}>
      {/* ドラッグリサイズハンドル */}
      <div
        className="bottom-panel__resize-handle"
        onMouseDown={handleResizeMouseDown}
        title="ドラッグしてサイズを変更"
      />

      {/* タブストリップ */}
      <div className="bottom-panel__header">
        <div className="bottom-panel__tab-strip" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={`bottom-panel__tab${
                activeTabId === tab.id ? " bottom-panel__tab--active" : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bottom-panel__header-actions">
          <button
            className="bottom-panel__icon-btn"
            onClick={closePanel}
            title="パネルを閉じる"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="bottom-panel__body" role="tabpanel">
        {activeTabId === "write" && <WritePanelContent />}
      </div>
    </div>
  );
};

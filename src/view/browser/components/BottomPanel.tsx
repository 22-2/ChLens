import { X } from "lucide-react";
import React, { useCallback, useRef } from "react";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";

export const BottomPanel: React.FC = () => {
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

  if (!isOpen) return null;

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
              className={`bottom-panel__tab${activeTabId === tab.id ? " bottom-panel__tab--active" : ""}`}
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

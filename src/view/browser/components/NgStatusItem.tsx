import { Ban } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

export const NgStatusItem: React.FC = () => {
  const { currentPage } = useTabStore();
  const {
    isNgTemporarilyDisabled,
    toggleNgTemporarilyDisabled,
    threadListStats,
    threadStats,
  } = useNgStatus();
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const panelKind =
    currentPage.type === "thread"
      ? "thread"
      : currentPage.type === "threadList"
        ? "threadList"
        : null;

  useEffect(() => {
    setIsWindowOpen(false);
  }, [panelKind]);

  const handleClick = useCallback(() => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setIsWindowOpen((prev) => !prev);
  }, []);

  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  if (panelKind == null) {
    return null;
  }

  const activeStats = panelKind === "thread" ? threadStats : threadListStats;
  const itemLabel = `NG ${activeStats.ngCount}`;
  const itemTitle = isNgTemporarilyDisabled
    ? `${itemLabel} (一時解除中)`
    : `${itemLabel}`;
  const buttonClassName = `status-bar__btn${
    isNgTemporarilyDisabled ? " status-bar__btn--muted" : ""
  }`;

  return (
    <>
      <StatusBarItem
        id="ng-status"
        alignment="left"
        priority={5}
        title={itemTitle}
        interactive
      >
        <button ref={btnRef} className={buttonClassName} onClick={handleClick}>
          <Ban size={12} />
          <span>{itemLabel}</span>
        </button>
      </StatusBarItem>

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title="NG設定"
          anchor={anchorRect}
          onClose={closeWindow}
          triggerRef={btnRef}
        >
          <div className="mini-window__section">
            <div className="mini-window__section-header">現在の件数</div>
            <p className="mini-window__note">NG: {activeStats.ngCount}件</p>
            <p className="mini-window__note">
              ハイライト: {activeStats.highlightCount}件
            </p>
          </div>

          <div className="mini-window__separator" />

          <div className="mini-window__section">
            {/* 一時解除はUI表示の切り替えだけに限定し、既存NG定義は保持する。 */}
            <div className="mini-window__toggle-row">
              <span className="mini-window__toggle-label">一時的にNGを解除</span>
              <button
                className={`mini-window__toggle-btn${
                  isNgTemporarilyDisabled ? " mini-window__toggle-btn--on" : ""
                }`}
                onClick={toggleNgTemporarilyDisabled}
              >
                {isNgTemporarilyDisabled ? "ON" : "OFF"}
              </button>
            </div>
            <p className="mini-window__note">
              ハイライト表示はこの切り替えの対象外です
            </p>
          </div>
        </MiniWindow>
      )}
    </>
  );
};

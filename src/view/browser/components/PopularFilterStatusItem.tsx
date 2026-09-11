import { ListFilter } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useTabStore, useTabViewState } from "src/view/browser/hooks/use-tab-store";
import {
  DEFAULT_POPULAR_REPLY_THRESHOLD,
  MAX_POPULAR_REPLY_THRESHOLD,
  MIN_POPULAR_REPLY_THRESHOLD,
  normalizePopularReplyThreshold,
} from "src/view/browser/utils/popular-filter";

export const PopularFilterStatusItem: React.FC = () => {
  const { activeTab, currentPage } = useTabStore();
  const { state: viewState, update: updateViewState } = useTabViewState(activeTab.id, currentPage);
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isPopularFilterEnabled = currentPage.type === "thread" && viewState.filter === "popular";
  const threshold = normalizePopularReplyThreshold(
    viewState.popularReplyThreshold ?? DEFAULT_POPULAR_REPLY_THRESHOLD,
  );
  const itemLabel = `人気レス ${threshold}件以上`;

  useEffect(() => {
    // フィルタを切り替えたあとに、表示対象ではない設定パネルだけが残らないよう閉じる。
    if (!isPopularFilterEnabled) {
      setIsWindowOpen(false);
    }
  }, [isPopularFilterEnabled]);

  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  const handleClick = useCallback(() => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setIsWindowOpen((prev) => !prev);
  }, []);

  const handleThresholdChange = useCallback(
    (value: number) => {
      // 本文側と同じ viewState を更新し、スライダー操作だけで表示レスを再計算させる。
      updateViewState({ popularReplyThreshold: normalizePopularReplyThreshold(value) });
    },
    [updateViewState],
  );

  if (!isPopularFilterEnabled) {
    return null;
  }

  return (
    <>
      <StatusBarItem
        id="popular-filter-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.popularFilter}
        title={itemLabel}
        interactive
      >
        <button
          ref={btnRef}
          className="status-bar__btn"
          onClick={handleClick}
          title={itemLabel}
          aria-label={itemLabel}
        >
          <ListFilter size={13} aria-hidden="true" />
          <span className="status-bar__btn-label">≥{threshold}</span>
        </button>
      </StatusBarItem>

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title="人気フィルタ"
          anchor={anchorRect}
          onClose={closeWindow}
          triggerRef={btnRef}
        >
          <div className="mini-window__section">
            <div className="mini-window__section-header">人気レス閾値</div>
            <div className="mini-window__slider-row">
              <input
                className="mini-window__slider"
                type="range"
                min={MIN_POPULAR_REPLY_THRESHOLD}
                max={MAX_POPULAR_REPLY_THRESHOLD}
                step={1}
                value={threshold}
                aria-label="人気レス閾値"
                onChange={(event) => handleThresholdChange(Number(event.target.value))}
              />
              <span className="mini-window__slider-value">{threshold}件</span>
            </div>
            <p className="mini-window__note">返信がこの件数以上のレスを表示します</p>
          </div>
        </MiniWindow>
      )}
    </>
  );
};

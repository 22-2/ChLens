import { RefreshCw } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import {
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  useAutoRefreshPanel,
} from "src/view/browser/hooks/use-auto-refresh-panel";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";

// -----------------------------------------------------------------------
// ミニウィンドウの中身（UI のみ、ロジックは props 経由）
// -----------------------------------------------------------------------
interface AutoRefreshPanelContentProps {
  isEnabled: boolean;
  isOnThread: boolean;
  intervalSec: number;
  onToggle: () => void;
  onIntervalChange: (sec: number) => void;
}

const AutoRefreshPanelContent: React.FC<AutoRefreshPanelContentProps> = ({
  isEnabled,
  isOnThread,
  intervalSec,
  onToggle,
  onIntervalChange,
}) => (
  <>
    {/* 自動更新トグル */}
    <div className="mini-window__section">
      <div className="mini-window__toggle-row">
        <span className="mini-window__toggle-label">自動更新</span>
        <button
          className={`mini-window__toggle-btn${
            isEnabled ? " mini-window__toggle-btn--on" : ""
          }`}
          onClick={onToggle}
          disabled={!isOnThread}
          title={!isOnThread ? "スレッドを開いているときに有効です" : undefined}
        >
          {isEnabled ? "ON" : "OFF"}
        </button>
      </div>
      {!isOnThread && (
        <p className="mini-window__note">スレッドを開いているときに有効です</p>
      )}
    </div>

    <div className="mini-window__separator" />

    {/* 更新間隔スライダー */}
    <div className="mini-window__section">
      <div className="mini-window__section-header">更新間隔</div>
      <div className="mini-window__slider-row">
        <input
          className="mini-window__slider"
          type="range"
          min={MIN_INTERVAL_SEC}
          max={MAX_INTERVAL_SEC}
          step={5}
          value={intervalSec}
          onChange={(e) => onIntervalChange(Number(e.target.value))}
        />
        <span className="mini-window__slider-value">{intervalSec}秒</span>
      </div>
    </div>

    <div className="mini-window__separator" />

    {/* 自動スクロールスタイル（未実装・プレースホルダー） */}
    <div className="mini-window__section">
      <div className="mini-window__section-header">自動スクロールスタイル</div>
      <label className="mini-window__radio-row">
        <input type="radio" checked readOnly />
        <span>デフォルト</span>
      </label>
    </div>
  </>
);

// -----------------------------------------------------------------------
// ステータスバーアイテム本体
// -----------------------------------------------------------------------
export const AutoRefreshStatusItem: React.FC = () => {
  const { isOnThread, isEnabled, intervalSec, toggle, setIntervalSec } =
    useAutoRefreshPanel();
  const { canAutoScroll } = useAutoScrollState();

  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setIsWindowOpen((prev) => !prev);
  }, []);

  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  return (
    <>
      <StatusBarItem
        id="auto-refresh-status"
        alignment="left"
        priority={10}
        title={
          isEnabled ? `自動更新中 (${intervalSec}秒間隔)` : "自動更新の設定"
        }
      >
        <button
          ref={btnRef}
          className={`status-bar__btn${
            isEnabled ? " status-bar__btn--active" : ""
          }${!isOnThread && !isEnabled ? " status-bar__btn--muted" : ""}`}
          onClick={handleClick}
        >
          <RefreshCw
            size={12}
            className={isEnabled && canAutoScroll ? "icon--spinning" : undefined}
          />
          <span>{isEnabled ? `${intervalSec}s` : "自動更新"}</span>
        </button>
      </StatusBarItem>

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title="自動更新設定"
          anchor={anchorRect}
          onClose={closeWindow}
        >
          <AutoRefreshPanelContent
            isEnabled={isEnabled}
            isOnThread={isOnThread}
            intervalSec={intervalSec}
            onToggle={toggle}
            onIntervalChange={setIntervalSec}
          />
        </MiniWindow>
      )}
    </>
  );
};

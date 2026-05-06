import { Clock3, Pause, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import {
  StatusBarItem,
  StatusBarMode,
} from "src/view/browser/components/StatusBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { useAutoNextThreadSetting } from "src/view/browser/hooks/use-auto-next-thread-setting";
import {
  MAX_BOARD_INTERVAL_SEC,
  MAX_INTERVAL_SEC,
  MIN_BOARD_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  useAutoRefreshPanel,
} from "src/view/browser/hooks/use-auto-refresh-panel";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";

// -----------------------------------------------------------------------
// ミニウィンドウの中身（UI のみ、ロジックは props 経由）
// -----------------------------------------------------------------------
interface ThreadAutoRefreshPanelContentProps {
  isEnabled: boolean;
  isOnThread: boolean;
  isAutoNextThreadEnabled: boolean;
  intervalSec: number;
  onAutoNextThreadToggle: () => void;
  onToggle: () => void;
  onIntervalChange: (sec: number) => void;
}

const ThreadAutoRefreshPanelContent: React.FC<
  ThreadAutoRefreshPanelContentProps
> = ({
  isEnabled,
  isOnThread,
  isAutoNextThreadEnabled,
  intervalSec,
  onAutoNextThreadToggle,
  onToggle,
  onIntervalChange,
}) => (
  <>
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

    {/* 実装が追いつくまでは選択 UI だけ先に揃え、ラジオの占有面積を減らす。 */}
    <div className="mini-window__section">
      <div className="mini-window__section-header">自動スクロールスタイル</div>
      <div className="mini-window__select-row">
        <select
          className="mini-window__select"
          aria-label="自動スクロールスタイル"
          defaultValue="default"
        >
          <option value="default">デフォルト</option>
        </select>
      </div>
    </div>

    <div className="mini-window__separator" />

    <div className="mini-window__section">
      <div className="mini-window__toggle-row">
        <span className="mini-window__toggle-label">自動次スレ移動</span>
        <button
          className={`mini-window__toggle-btn${
            isAutoNextThreadEnabled ? " mini-window__toggle-btn--on" : ""
          }`}
          onClick={onAutoNextThreadToggle}
          disabled={!isOnThread}
          title={!isOnThread ? "スレッドを開いているときに有効です" : undefined}
        >
          {isAutoNextThreadEnabled ? "ON" : "OFF"}
        </button>
      </div>
      <p className="mini-window__note">
        1000到達やdat落ち後に3秒ごとに次スレを探し、見つかれば同じタブで移動します
      </p>
      <p className="mini-window__note">
        移動直後は、より勢いのある本流候補も短時間だけ監視します
      </p>

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
            title={
              !isOnThread ? "スレッドを開いているときに有効です" : undefined
            }
          >
            {isEnabled ? "ON" : "OFF"}
          </button>
        </div>
        {!isOnThread && (
          <p className="mini-window__note">
            スレッドを開いているときに有効です
          </p>
        )}
      </div>
    </div>
  </>
);

interface ThreadListAutoRefreshPanelContentProps {
  isEnabled: boolean;
  intervalSec: number;
  onToggle: () => void;
  onIntervalChange: (sec: number) => void;
}

const ThreadListAutoRefreshPanelContent: React.FC<
  ThreadListAutoRefreshPanelContentProps
> = ({ isEnabled, intervalSec, onToggle, onIntervalChange }) => (
  <>
    <div className="mini-window__section">
      <div className="mini-window__toggle-row">
        <span className="mini-window__toggle-label">自動更新</span>
        <button
          className={`mini-window__toggle-btn${
            isEnabled ? " mini-window__toggle-btn--on" : ""
          }`}
          onClick={onToggle}
        >
          {isEnabled ? "ON" : "OFF"}
        </button>
      </div>
      <p className="mini-window__note">
        スレ一覧を開いている間だけ、同じタブで自動更新します
      </p>
    </div>

    <div className="mini-window__separator" />

    <div className="mini-window__section">
      <div className="mini-window__section-header">更新間隔</div>
      <div className="mini-window__slider-row">
        <input
          className="mini-window__slider"
          type="range"
          min={MIN_BOARD_INTERVAL_SEC}
          max={MAX_BOARD_INTERVAL_SEC}
          step={10}
          value={intervalSec}
          onChange={(e) => onIntervalChange(Number(e.target.value))}
        />
        <span className="mini-window__slider-value">{intervalSec}秒</span>
      </div>
      <p className="mini-window__note">20秒から300秒の範囲で設定できます</p>
    </div>
  </>
);

// -----------------------------------------------------------------------
// ステータスバーアイテム本体
// -----------------------------------------------------------------------
export const AutoRefreshStatusItem: React.FC = () => {
  const { panelKind, isOnThread, isEnabled, intervalSec, toggle, setIntervalSec } =
    useAutoRefreshPanel();
  const {
    enabled: isAutoNextThreadEnabled,
    setEnabled: setAutoNextThreadEnabled,
  } = useAutoNextThreadSetting();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();

  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 変更理由: 全体の status-bar accent は StatusBarMode が source of truth なので、
  // スレ/スレ一覧の両方で同じ active 判定をここに集約する。
  const isStatusActive =
    panelKind === "thread"
      ? isEnabled && !isPaused && (canAutoScroll || isAutoScrolling)
      : panelKind === "threadList"
        ? isEnabled
        : false;
  const intervalLabel = `${intervalSec} s`;

  // 早期returnする前にすべてのhooksを呼び出す必要があるため、
  // panelKindのチェックはif文で早期return前に移動するのではなく、
  // JSXレベルで条件分岐を実装する
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

  // panelKindがnullの場合はこのコンポーネント全体を表示しない
  if (panelKind == null) {
    return null;
  }

  const itemTitle =
    panelKind === "thread"
      ? !isEnabled
        ? "スレッド自動更新: OFF"
        : isPaused
          ? `スレッド自動更新: 一時停止中（ポップアップ表示中, ${intervalSec}秒間隔）`
          : canAutoScroll || isAutoScrolling
            ? `スレッド自動更新: 追従中（${intervalSec}秒間隔）`
            : `スレッド自動更新: 待機中（しきい線より上, ${intervalSec}秒間隔）`
      : !isEnabled
        ? "スレ一覧自動更新: OFF"
        : `スレ一覧自動更新: ON（${intervalSec}秒間隔）`;

  const renderStatusIcon = () => {
    if (panelKind === "thread") {
      if (!isEnabled) {
        return <RefreshCw size={13} aria-hidden="true" />;
      }
      if (isPaused) {
        return <Pause size={13} aria-hidden="true" />;
      }
      if (canAutoScroll || isAutoScrolling) {
        return (
          <RefreshCw size={13} className="icon--spinning" aria-hidden="true" />
        );
      }
      return <Clock3 size={13} aria-hidden="true" />;
    }

    if (isEnabled) {
      return (
        <RefreshCw size={13} className="icon--spinning" aria-hidden="true" />
      );
    }

    return <Pause size={13} aria-hidden="true" />;
  };

  const buttonClassName = `status-bar__btn${
    panelKind === "threadList" && !isEnabled ? " status-bar__btn--muted" : ""
  }`;
  const windowTitle =
    panelKind === "thread" ? "スレッド自動更新" : "スレ一覧自動更新";

  return (
    <>
      <StatusBarMode
        id="auto-refresh-status-mode"
        appearance={isStatusActive ? "active" : null}
      />

      <StatusBarItem
        id="auto-refresh-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.autoRefresh}
        title={itemTitle}
        interactive
      >
        <button
          ref={btnRef}
          className={buttonClassName}
          onClick={handleClick}
          title={itemTitle}
          aria-label={itemTitle}
        >
          {renderStatusIcon()}
          {
            // 変更理由: ステータスバー上で現在値が見えないと、
            // ミニウィンドウを開くまで更新間隔を確認できず操作往復が増えるため。
          }
          <span className="status-bar__btn-label">{intervalLabel}</span>
        </button>
      </StatusBarItem>

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title={windowTitle}
          anchor={anchorRect}
          onClose={closeWindow}
          triggerRef={btnRef}
        >
          {panelKind === "thread" ? (
            <ThreadAutoRefreshPanelContent
              isEnabled={isEnabled}
              isOnThread={isOnThread}
              isAutoNextThreadEnabled={isAutoNextThreadEnabled}
              intervalSec={intervalSec}
              onAutoNextThreadToggle={() =>
                setAutoNextThreadEnabled(!isAutoNextThreadEnabled)
              }
              onToggle={toggle}
              onIntervalChange={setIntervalSec}
            />
          ) : (
            <ThreadListAutoRefreshPanelContent
              isEnabled={isEnabled}
              intervalSec={intervalSec}
              onToggle={toggle}
              onIntervalChange={setIntervalSec}
            />
          )}
        </MiniWindow>
      )}
    </>
  );
};

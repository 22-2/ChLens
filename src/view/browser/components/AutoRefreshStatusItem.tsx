import { Clock3, Pause, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { container } from "src/service-container/index";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { useAutoNextThreadSetting } from "src/view/browser/hooks/use-auto-next-thread-setting";
import {
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  useAutoRefreshPanel,
} from "src/view/browser/hooks/use-auto-refresh-panel";
import { useAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

const BOARD_CONFIG_KEY = "auto_load_second_board";
const MAX_BOARD_INTERVAL_SEC = 300;
const MIN_BOARD_INTERVAL_SEC = 20;

function readBoardIntervalSec(): number {
  const raw = container.config.get(BOARD_CONFIG_KEY);
  const ms = Number.parseInt(raw ?? "0", 10);
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.max(0, Math.min(MAX_BOARD_INTERVAL_SEC, Math.round(ms / 1000)));
}

function useBoardIntervalSec(): {
  intervalSec: number;
  setIntervalSec: (sec: number) => void;
} {
  const [intervalSec, setIntervalSecState] = useState(readBoardIntervalSec);

  useEffect(() => {
    const sync = () => setIntervalSecState(readBoardIntervalSec());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === BOARD_CONFIG_KEY) {
        sync();
      }
    };

    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  const setIntervalSec = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(MAX_BOARD_INTERVAL_SEC, sec));
    setIntervalSecState(clamped);
    // legacy 設定と揃えるため、内部保存値は秒ではなく ms のまま扱う。
    container.config.set(BOARD_CONFIG_KEY, String(clamped * 1000));
  }, []);

  return { intervalSec, setIntervalSec };
}

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
    </div>
  </>
);

interface ThreadListAutoRefreshPanelContentProps {
  intervalSec: number;
  onIntervalChange: (sec: number) => void;
}

const ThreadListAutoRefreshPanelContent: React.FC<
  ThreadListAutoRefreshPanelContentProps
> = ({ intervalSec, onIntervalChange }) => (
  <>
    <div className="mini-window__section">
      <div className="mini-window__section-header">更新間隔</div>
      <div className="mini-window__slider-row">
        <input
          className="mini-window__slider"
          type="range"
          min={0}
          max={MAX_BOARD_INTERVAL_SEC}
          step={10}
          value={intervalSec}
          onChange={(e) => onIntervalChange(Number(e.target.value))}
        />
        <span className="mini-window__slider-value">
          {intervalSec > 0 ? `${intervalSec}秒` : "OFF"}
        </span>
      </div>
      <p className="mini-window__note">20秒未満では無効になります</p>
    </div>
  </>
);

// -----------------------------------------------------------------------
// ステータスバーアイテム本体
// -----------------------------------------------------------------------
export const AutoRefreshStatusItem: React.FC = () => {
  const { currentPage } = useTabStore();
  const { isOnThread, isEnabled, intervalSec, toggle, setIntervalSec } =
    useAutoRefreshPanel();
  const {
    enabled: isAutoNextThreadEnabled,
    setEnabled: setAutoNextThreadEnabled,
  } = useAutoNextThreadSetting();
  const { intervalSec: boardIntervalSec, setIntervalSec: setBoardIntervalSec } =
    useBoardIntervalSec();
  const { canAutoScroll, isAutoScrolling, isPaused } = useAutoScrollState();

  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const panelKind =
    currentPage.type === "thread"
      ? "thread"
      : currentPage.type === "threadList"
        ? "threadList"
        : null;
  const isBoardIntervalEnabled = boardIntervalSec >= MIN_BOARD_INTERVAL_SEC;

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
      : isBoardIntervalEnabled
        ? `スレ一覧自動更新の設定 (${boardIntervalSec}秒間隔)`
        : "スレ一覧自動更新の設定";

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

    if (isBoardIntervalEnabled) {
      return (
        <RefreshCw size={13} className="icon--spinning" aria-hidden="true" />
      );
    }

    return <Pause size={13} aria-hidden="true" />;
  };

  const buttonClassName = `status-bar__btn${
    panelKind === "thread" && isEnabled ? " status-bar__btn--active" : ""
  }${
    panelKind === "threadList" && !isBoardIntervalEnabled
      ? " status-bar__btn--muted"
      : ""
  }`;
  const windowTitle =
    panelKind === "thread" ? "スレッド自動更新" : "スレ一覧自動更新";

  return (
    <>
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
              intervalSec={boardIntervalSec}
              onIntervalChange={setBoardIntervalSec}
            />
          )}
        </MiniWindow>
      )}
    </>
  );
};

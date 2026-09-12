import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  DEFAULT_NG_DISPLAY_MODE,
  NG_DISPLAY_CONFIG_KEY,
  type NgDisplayMode,
  normalizeNgDisplayMode,
} from "src/view/browser/utils/ng-display-mode";

interface NgStats {
  ngCount: number;
  highlightCount: number;
}

interface NgStatusContextValue {
  isNgTemporarilyDisabled: boolean;
  setNgTemporarilyDisabled: (disabled: boolean) => void;
  toggleNgTemporarilyDisabled: () => void;
  ngDisplayMode: NgDisplayMode;
  threadStats: NgStats;
  threadListStats: NgStats;
  setThreadStats: (stats: NgStats) => void;
  setThreadListStats: (stats: NgStats) => void;
}

const DEFAULT_STATS: NgStats = { ngCount: 0, highlightCount: 0 };

interface NgToggleContextValue {
  isNgTemporarilyDisabled: boolean;
  setNgTemporarilyDisabled: (disabled: boolean) => void;
  toggleNgTemporarilyDisabled: () => void;
  ngDisplayMode: NgDisplayMode;
}

interface NgStatsContextValue {
  threadStats: NgStats;
  threadListStats: NgStats;
  setThreadStats: (stats: NgStats) => void;
  setThreadListStats: (stats: NgStats) => void;
}

const defaultToggleContextValue: NgToggleContextValue = {
  isNgTemporarilyDisabled: false,
  setNgTemporarilyDisabled: () => {},
  toggleNgTemporarilyDisabled: () => {},
  // Provider外の単体描画でも、従来の「クリックで表示」を維持する。
  ngDisplayMode: "soft-ng",
};

const defaultStatsContextValue: NgStatsContextValue = {
  threadStats: DEFAULT_STATS,
  threadListStats: DEFAULT_STATS,
  setThreadStats: () => {},
  setThreadListStats: () => {},
};

const defaultContextValue: NgStatusContextValue = {
  isNgTemporarilyDisabled: false,
  setNgTemporarilyDisabled: () => {},
  toggleNgTemporarilyDisabled: () => {},
  ngDisplayMode: "soft-ng",
  threadStats: DEFAULT_STATS,
  threadListStats: DEFAULT_STATS,
  setThreadStats: () => {},
  setThreadListStats: () => {},
};

const NgStatusContext = createContext<NgStatusContextValue>(defaultContextValue);
// レス一覧は「一時NG解除フラグ」だけ参照するため、統計更新のたびに
// 数百〜数千件の ResItem が再レンダーされないよう購読口を分離する。
const NgToggleContext = createContext<NgToggleContextValue>(defaultToggleContextValue);
const NgStatsContext = createContext<NgStatsContextValue>(defaultStatsContextValue);

export const NgStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isNgTemporarilyDisabled, setNgTemporarilyDisabled] = useState(false);
  const [ngDisplayMode, setNgDisplayMode] = useState<NgDisplayMode>(DEFAULT_NG_DISPLAY_MODE);
  const [threadStats, setThreadStats] = useState<NgStats>(DEFAULT_STATS);
  const [threadListStats, setThreadListStats] = useState<NgStats>(DEFAULT_STATS);

  useEffect(() => {
    // 設定変更を全ペインへ通知し、現在開いているレスにも表示方式を即時反映する。
    return subscribeConfigKeys(
      [NG_DISPLAY_CONFIG_KEY],
      () => setNgDisplayMode(normalizeNgDisplayMode(readConfigValue(NG_DISPLAY_CONFIG_KEY))),
      { label: "NgStatus" },
    );
  }, []);

  const toggleNgTemporarilyDisabled = useCallback(() => {
    setNgTemporarilyDisabled((prev) => !prev);
  }, []);

  const toggleValue = useMemo<NgToggleContextValue>(
    () => ({
      isNgTemporarilyDisabled,
      setNgTemporarilyDisabled,
      toggleNgTemporarilyDisabled,
      ngDisplayMode,
    }),
    [isNgTemporarilyDisabled, ngDisplayMode, toggleNgTemporarilyDisabled],
  );

  const statsValue = useMemo<NgStatsContextValue>(
    () => ({
      threadStats,
      threadListStats,
      setThreadStats,
      setThreadListStats,
    }),
    [threadListStats, threadStats],
  );

  const value = useMemo<NgStatusContextValue>(
    () => ({
      isNgTemporarilyDisabled,
      setNgTemporarilyDisabled,
      toggleNgTemporarilyDisabled,
      ngDisplayMode,
      threadStats,
      threadListStats,
      setThreadStats,
      setThreadListStats,
    }),
    [
      isNgTemporarilyDisabled,
      ngDisplayMode,
      threadListStats,
      threadStats,
      toggleNgTemporarilyDisabled,
    ],
  );

  return (
    <NgToggleContext.Provider value={toggleValue}>
      <NgStatsContext.Provider value={statsValue}>
        <NgStatusContext.Provider value={value}>{children}</NgStatusContext.Provider>
      </NgStatsContext.Provider>
    </NgToggleContext.Provider>
  );
};

export function useNgStatus(): NgStatusContextValue {
  return useContext(NgStatusContext);
}

export function useIsNgTemporarilyDisabled(): boolean {
  return useContext(NgToggleContext).isNgTemporarilyDisabled;
}

export function useNgDisplayMode(): NgDisplayMode {
  return useContext(NgToggleContext).ngDisplayMode;
}

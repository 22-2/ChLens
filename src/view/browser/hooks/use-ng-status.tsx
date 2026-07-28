import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface NgStats {
  ngCount: number;
  highlightCount: number;
}

interface NgStatusContextValue {
  isNgTemporarilyDisabled: boolean;
  setNgTemporarilyDisabled: (disabled: boolean) => void;
  toggleNgTemporarilyDisabled: () => void;
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
  const [threadStats, setThreadStats] = useState<NgStats>(DEFAULT_STATS);
  const [threadListStats, setThreadListStats] = useState<NgStats>(DEFAULT_STATS);

  const toggleNgTemporarilyDisabled = useCallback(() => {
    setNgTemporarilyDisabled((prev) => !prev);
  }, []);

  const toggleValue = useMemo<NgToggleContextValue>(
    () => ({
      isNgTemporarilyDisabled,
      setNgTemporarilyDisabled,
      toggleNgTemporarilyDisabled,
    }),
    [isNgTemporarilyDisabled, toggleNgTemporarilyDisabled],
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
      threadStats,
      threadListStats,
      setThreadStats,
      setThreadListStats,
    }),
    [isNgTemporarilyDisabled, threadListStats, threadStats, toggleNgTemporarilyDisabled],
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

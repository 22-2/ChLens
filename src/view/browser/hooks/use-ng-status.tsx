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

const defaultContextValue: NgStatusContextValue = {
  isNgTemporarilyDisabled: false,
  setNgTemporarilyDisabled: () => {},
  toggleNgTemporarilyDisabled: () => {},
  threadStats: DEFAULT_STATS,
  threadListStats: DEFAULT_STATS,
  setThreadStats: () => {},
  setThreadListStats: () => {},
};

const NgStatusContext =
  createContext<NgStatusContextValue>(defaultContextValue);

export const NgStatusProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isNgTemporarilyDisabled, setNgTemporarilyDisabled] = useState(false);
  const [threadStats, setThreadStats] = useState<NgStats>(DEFAULT_STATS);
  const [threadListStats, setThreadListStats] =
    useState<NgStats>(DEFAULT_STATS);

  const toggleNgTemporarilyDisabled = useCallback(() => {
    setNgTemporarilyDisabled((prev) => !prev);
  }, []);

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
    <NgStatusContext.Provider value={value}>{children}</NgStatusContext.Provider>
  );
};

export function useNgStatus(): NgStatusContextValue {
  return useContext(NgStatusContext);
}

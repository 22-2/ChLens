import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface AutoScrollState {
  /** スレッド最下部付近にいて自動追従が有効な状態 */
  canAutoScroll: boolean;
  /** 自動スクロールが実行中 */
  isAutoScrolling: boolean;
}

const INITIAL: AutoScrollState = { canAutoScroll: false, isAutoScrolling: false };

const ReadContext = createContext<AutoScrollState>(INITIAL);
const WriteContext = createContext<(state: AutoScrollState) => void>(() => {});

export const AutoScrollStateProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AutoScrollState>(INITIAL);
  const write = useMemo(() => setState, []);
  return (
    <WriteContext.Provider value={write}>
      <ReadContext.Provider value={state}>{children}</ReadContext.Provider>
    </WriteContext.Provider>
  );
};

/** 自動スクロール状態を読む */
export function useAutoScrollState(): AutoScrollState {
  return useContext(ReadContext);
}

/** 自動スクロール状態を書き込む（useThreadAutoRefresh 内部から呼ぶ） */
export function useSetAutoScrollState(): (state: AutoScrollState) => void {
  return useContext(WriteContext);
}

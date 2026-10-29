import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface AutoScrollState {
  /** スレッド最下部付近にいて自動追従が有効な状態 */
  canAutoScroll: boolean;
  /** 自動スクロールが実行中 */
  isAutoScrolling: boolean;
  /** ポップアップ表示などで自動追従だけ一時停止中 */
  isPaused: boolean;
}

const INITIAL: AutoScrollState = {
  canAutoScroll: false,
  isAutoScrolling: false,
  isPaused: false,
};

const ReadContext = createContext<AutoScrollState>(INITIAL);
const WriteContext = createContext<(state: AutoScrollState) => void>(() => {});
const PaneStatesContext = createContext<Record<string, AutoScrollState>>({});
const SetPaneStatesContext = createContext<React.Dispatch<
  React.SetStateAction<Record<string, AutoScrollState>>
> | null>(null);

/** ペイン外の共通タブバーにも各ペインの追従状態を共有する。 */
export const AutoScrollPaneStatesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [states, setStates] = useState<Record<string, AutoScrollState>>({});
  return (
    <SetPaneStatesContext.Provider value={setStates}>
      <PaneStatesContext.Provider value={states}>{children}</PaneStatesContext.Provider>
    </SetPaneStatesContext.Provider>
  );
};

export const AutoScrollStateProvider: React.FC<{ children: ReactNode; paneId?: string }> = ({
  children,
  paneId,
}) => {
  const [state, setState] = useState<AutoScrollState>(INITIAL);
  const setPaneStates = useContext(SetPaneStatesContext);
  useEffect(() => {
    if (!paneId || !setPaneStates) return;
    setPaneStates((previous) => ({ ...previous, [paneId]: state }));
  }, [paneId, setPaneStates, state]);
  useEffect(() => {
    if (!paneId || !setPaneStates) return;
    return () =>
      setPaneStates((previous) => {
        const next = { ...previous };
        delete next[paneId];
        return next;
      });
  }, [paneId, setPaneStates]);
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

/** 共通タブバーはペイン内の Context の外にあるため、ペインIDで状態を読む。 */
export function usePaneAutoScrollState(paneId: string): AutoScrollState {
  const states = useContext(PaneStatesContext);
  const local = useAutoScrollState();
  return states[paneId] ?? local;
}

/** 自動スクロール状態を書き込む（useThreadAutoRefresh 内部から呼ぶ） */
export function useSetAutoScrollState(): (state: AutoScrollState) => void {
  return useContext(WriteContext);
}

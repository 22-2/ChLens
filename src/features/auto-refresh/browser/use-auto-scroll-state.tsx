import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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

const PaneStatesContext = createContext<Record<string, AutoScrollState> | null>(null);
const SetPaneStatesContext = createContext<React.Dispatch<
  React.SetStateAction<Record<string, AutoScrollState>>
> | null>(null);
const PaneIdContext = createContext<string | null>(null);

/** ペイン内の画面と共通タブバーが同じ追従状態を読む。 */
export const AutoScrollPaneStatesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [states, setStates] = useState<Record<string, AutoScrollState>>({});
  return (
    <SetPaneStatesContext.Provider value={setStates}>
      <PaneStatesContext.Provider value={states}>{children}</PaneStatesContext.Provider>
    </SetPaneStatesContext.Provider>
  );
};

const ScopedAutoScrollStateProvider: React.FC<{ children: ReactNode; paneId: string }> = ({
  children,
  paneId,
}) => {
  const setPaneStates = useContext(SetPaneStatesContext);
  useEffect(() => {
    if (!setPaneStates) return;
    return () =>
      setPaneStates((previous) => {
        const next = { ...previous };
        delete next[paneId];
        return next;
      });
  }, [paneId, setPaneStates]);
  return <PaneIdContext.Provider value={paneId}>{children}</PaneIdContext.Provider>;
};

export const AutoScrollStateProvider: React.FC<{ children: ReactNode; paneId?: string }> = ({
  children,
  paneId,
}) => {
  const setPaneStates = useContext(SetPaneStatesContext);
  // 切り離し窓や Storybook は共通タブバーを持たないため、独立した状態領域を用意する。
  if (!setPaneStates) {
    return (
      <AutoScrollPaneStatesProvider>
        <ScopedAutoScrollStateProvider paneId={paneId ?? "standalone"}>
          {children}
        </ScopedAutoScrollStateProvider>
      </AutoScrollPaneStatesProvider>
    );
  }
  if (!paneId) throw new Error("共有された自動スクロール状態にはペインIDが必要です");
  return <ScopedAutoScrollStateProvider paneId={paneId}>{children}</ScopedAutoScrollStateProvider>;
};

/** 共通タブバーはペインIDで状態を読む。 */
export function usePaneAutoScrollState(paneId: string): AutoScrollState {
  const states = useContext(PaneStatesContext);
  if (!states) throw new Error("自動スクロール状態のプロバイダーがありません");
  return states[paneId] ?? INITIAL;
}

/** ペイン内の自動スクロール状態を読む。 */
export function useAutoScrollState(): AutoScrollState {
  const paneId = useContext(PaneIdContext);
  if (!paneId) throw new Error("自動スクロール状態のペインがありません");
  return usePaneAutoScrollState(paneId);
}

/** 自動スクロール状態を書き込む（useThreadAutoRefresh 内部から呼ぶ）。 */
export function useSetAutoScrollState(): (state: AutoScrollState) => void {
  const paneId = useContext(PaneIdContext);
  const setPaneStates = useContext(SetPaneStatesContext);
  if (!paneId || !setPaneStates) throw new Error("自動スクロール状態のペインがありません");
  return useCallback(
    (state: AutoScrollState) => {
      setPaneStates((previous) => ({ ...previous, [paneId]: state }));
    },
    [paneId, setPaneStates],
  );
}

import { useEffect, type RefObject } from "react";
import { useAutoRefresh, type UseAutoRefreshResult } from "src/view/browser/hooks/use-auto-refresh";
import {
  useSetAutoScrollState,
} from "src/view/browser/hooks/use-auto-scroll-state";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

interface UseThreadAutoRefreshOptions {
  threadUrl: string;
  expired: boolean;
  loading: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  /** ポップアップ表示中など、自動スクロールを一時停止すべきとき。省略時は false */
  pauseAutoScroll?: boolean;
}

/**
 * useAutoRefresh の薄いラッパー。
 * - `enabled` を tabStore から自動取得する（threadUrl で照合）
 * - `requestRefresh` を内部で dispatch(RELOAD) に固定する
 * - canAutoScroll / isAutoScrolling を AutoScrollStateContext へ書き込む
 *
 * 低レベルな useAutoRefresh はテスト可能なまま残す。
 */
export function useThreadAutoRefresh(
  options: UseThreadAutoRefreshOptions,
): UseAutoRefreshResult {
  const {
    threadUrl,
    expired,
    loading,
    responseCount,
    lastResponseNum,
    rootRef,
    pauseAutoScroll = false,
  } = options;

  const { activeTab, dispatch } = useTabStore();
  const setAutoScrollState = useSetAutoScrollState();

  const enabled =
    activeTab.autoRefreshEnabled &&
    activeTab.autoRefreshThreadUrl === threadUrl;

  const result = useAutoRefresh({
    enabled,
    expired,
    loading,
    pauseAutoScroll,
    responseCount,
    lastResponseNum,
    rootRef,
    requestRefresh: () => dispatch({ type: "RELOAD" }),
  });

  // canAutoScroll / isAutoScrolling をコンテキストへ同期して
  // ステータスバーアイコンなど外部コンポーネントが参照できるようにする
  useEffect(() => {
    setAutoScrollState(
      enabled
        ? { canAutoScroll: result.canAutoScroll, isAutoScrolling: result.isAutoScrolling }
        : { canAutoScroll: false, isAutoScrolling: false },
    );
  }, [enabled, result.canAutoScroll, result.isAutoScrolling, setAutoScrollState]);

  return result;
}

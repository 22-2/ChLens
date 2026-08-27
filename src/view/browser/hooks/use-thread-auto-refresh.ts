import { useEffect, type RefObject } from "react";
import { useAutoRefresh, type UseAutoRefreshResult } from "src/view/browser/hooks/use-auto-refresh";
import { useSetAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";
import type { ThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";

interface UseThreadAutoRefreshOptions {
  enabled: boolean;
  threadUrl: string;
  refreshController: ThreadRefreshController;
  expired: boolean;
  loading: boolean;
  responseCount: number;
  lastResponseNum: number | null;
  rootRef: RefObject<HTMLDivElement | null>;
  requestRefresh: () => void;
  /** ポップアップ表示中など、自動スクロールを一時停止すべきとき。省略時は false */
  pauseAutoScroll?: boolean;
  /** 新着が一定回数(=間隔×N)来ず放置と判断したとき、自動更新を止めるために呼ぶ。 */
  onAutoStop?: () => void;
}

/**
 * useAutoRefresh の薄いラッパー。
 * - `enabled` を tabStore から自動取得する（threadUrl で照合）
 * - `requestRefresh` を内部で dispatch(RELOAD) に固定する
 * - canAutoScroll / isAutoScrolling を AutoScrollStateContext へ書き込む
 *
 * 低レベルな useAutoRefresh はテスト可能なまま残す。
 */
export function useThreadAutoRefresh(options: UseThreadAutoRefreshOptions): UseAutoRefreshResult {
  const {
    enabled,
    threadUrl: _threadUrl,
    refreshController,
    expired,
    loading,
    responseCount,
    lastResponseNum,
    rootRef,
    requestRefresh,
    pauseAutoScroll = false,
    onAutoStop,
  } = options;

  const setAutoScrollState = useSetAutoScrollState();

  const result = useAutoRefresh({
    enabled,
    expired,
    loading,
    refreshController,
    pauseAutoScroll,
    responseCount,
    lastResponseNum,
    rootRef,
    requestRefresh,
    onAutoStop,
  });

  // canAutoScroll / isAutoScrolling をコンテキストへ同期して
  // ステータスバーアイコンなど外部コンポーネントが参照できるようにする
  useEffect(() => {
    setAutoScrollState(
      enabled
        ? {
            canAutoScroll: result.canAutoScroll,
            isAutoScrolling: result.isAutoScrolling,
            // 自動更新は継続しつつ追従だけ止めている状態を明示し、
            // スピナー以外のアイコンでも一時停止理由を判別できるようにする。
            isPaused: pauseAutoScroll,
          }
        : { canAutoScroll: false, isAutoScrolling: false, isPaused: false },
    );
  }, [enabled, pauseAutoScroll, result.canAutoScroll, result.isAutoScrolling, setAutoScrollState]);

  return result;
}

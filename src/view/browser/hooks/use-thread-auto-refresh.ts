import { useEffect } from "react";
import {
  useAutoRefresh,
  type UseAutoRefreshOptions,
  type UseAutoRefreshResult,
} from "src/view/browser/hooks/use-auto-refresh";
import { useSetAutoScrollState } from "src/view/browser/hooks/use-auto-scroll-state";

type UseThreadAutoRefreshOptions = Omit<UseAutoRefreshOptions, "scopeUrl" | "pauseAutoScroll"> & {
  /** 表示中のスレッドURL。自動更新間隔のサイト・板スコープにも使う。 */
  threadUrl: string;
  /** ポップアップ表示中など、自動スクロールを一時停止すべきとき。省略時は false */
  pauseAutoScroll?: boolean;
};

/**
 * スレッド画面向けの useAutoRefresh のラッパー。
 * - threadUrl を自動更新間隔のスコープとして渡す
 * - canAutoScroll / isAutoScrolling を AutoScrollStateContext へ書き込む
 *
 * 低レベルな useAutoRefresh は Context に依存させず、テスト可能なまま残す。
 */
export function useThreadAutoRefresh({
  threadUrl,
  pauseAutoScroll = false,
  ...options
}: UseThreadAutoRefreshOptions): UseAutoRefreshResult {
  const { enabled } = options;
  const setAutoScrollState = useSetAutoScrollState();

  const result = useAutoRefresh({ ...options, scopeUrl: threadUrl, pauseAutoScroll });

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

import { useCallback, useLayoutEffect, useRef } from "react";

export type RefreshKeyChangeSource = "internal" | "external";

interface RefreshKeyChange {
  key: number;
  source: RefreshKeyChangeSource;
}

export interface ThreadRefreshController {
  refreshKey: number;
  beginRequest: () => number;
  isLatestRequest: (requestId: number) => boolean;
  markInternalRefreshRequest: () => void;
  consumeRefreshKeyChange: () => RefreshKeyChangeSource | null;
  consumeRefreshCompletionGate: () => boolean;
}

/**
 * スレッド更新に関係する「開始」と「完了」の世代を一箇所で管理する。
 *
 * スクロール処理とデータ取得処理がそれぞれ独自に更新状態を推測すると、
 * RELOADのrender、取得開始、レス描画、loading解除の順序がずれたときに
 * 古い結果や更新前の高さを使ってしまうため、共有する世代情報をここへ集約する。
 */
export function useThreadRefreshController(refreshKey: number): ThreadRefreshController {
  const latestRequestIdRef = useRef(0);
  const previousRefreshKeyRef = useRef(refreshKey);
  const expectedInternalRefreshKeyRef = useRef<number | null>(null);
  const refreshKeyChangeRef = useRef<RefreshKeyChange | null>(null);
  const refreshCompletionGateRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const previousRefreshKey = previousRefreshKeyRef.current;
    previousRefreshKeyRef.current = refreshKey;

    if (refreshKey === previousRefreshKey) {
      return;
    }

    const isInternalRefresh = expectedInternalRefreshKeyRef.current === refreshKey;
    if (isInternalRefresh) {
      expectedInternalRefreshKeyRef.current = null;
    }

    refreshKeyChangeRef.current = {
      key: refreshKey,
      source: isInternalRefresh ? "internal" : "external",
    };
    // データ取得のeffectが走る前に、同じrenderの完了処理を一回だけ保留する。
    refreshCompletionGateRef.current = refreshKey;
  }, [refreshKey]);

  const beginRequest = useCallback(() => {
    return ++latestRequestIdRef.current;
  }, []);

  const isLatestRequest = useCallback((requestId: number) => {
    return latestRequestIdRef.current === requestId;
  }, []);

  const markInternalRefreshRequest = useCallback(() => {
    // 自動更新側は先に高さを保存してからRELOADを発行するため、
    // refreshKeyの変化を外部更新として同じスナップショットへ重ねない。
    expectedInternalRefreshKeyRef.current = refreshKey + 1;
  }, [refreshKey]);

  const consumeRefreshKeyChange = useCallback((): RefreshKeyChangeSource | null => {
    const refreshKeyChange = refreshKeyChangeRef.current;
    if (!refreshKeyChange || refreshKeyChange.key !== refreshKey) {
      return null;
    }

    refreshKeyChangeRef.current = null;
    return refreshKeyChange.source;
  }, [refreshKey]);

  const consumeRefreshCompletionGate = useCallback(() => {
    if (refreshCompletionGateRef.current !== refreshKey) {
      return false;
    }

    refreshCompletionGateRef.current = null;
    return true;
  }, [refreshKey]);

  return {
    refreshKey,
    beginRequest,
    isLatestRequest,
    markInternalRefreshRequest,
    consumeRefreshKeyChange,
    consumeRefreshCompletionGate,
  };
}

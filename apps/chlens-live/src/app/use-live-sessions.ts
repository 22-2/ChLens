import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveBoardSession, type LiveBoardSessionEvent } from "../live-session/board-session";
import { LiveThreadSession, type LiveThreadSessionEvent } from "../live-session/session";
import type { ChLensLiveSource } from "../live-session/source";
import type { LiveBoardSnapshot, LiveThreadCache, LiveThreadSnapshot } from "../live-session/cache";
import type { LiveSessionOwner } from "../live-session/owner";

export interface UseLiveBoardResult {
  snapshot: LiveBoardSnapshot | null;
  error: unknown;
  loading: boolean;
  refresh: () => void;
  stop: () => void;
}

export interface UseLiveThreadResult {
  snapshot: LiveThreadSnapshot | null;
  error: unknown;
  loading: boolean;
  running: boolean;
  pollingEnabled: boolean;
  start: () => void;
  refresh: () => void;
  stop: () => void;
  setPollingEnabled: (enabled: boolean) => void;
}

/**
 * LiveBoardSession / LiveThreadSession をReactから安全に使うための薄いhook層。
 *
 * UIはsessionのsubscribe契約だけに依存し、pollingやcacheの詳細を知らない。
 * sessionインスタンスはurl単位でメモ化し、unmount時に必ずstopしてtimer漏れを防ぐ。
 *
 * 無限リクエスト防止のための不変条件:
 * - subscribe関数はuseCallbackで安定させ、effectが再レンダーで再実行されないようにする
 *   （inline関数を依存に入れると「レンダー→effect→setState→レンダー」のループになる）
 * - effect内でstateをリセットしない（リセット自体が再レンダーを誘発するため）
 * - start()はsessionインスタンスごとに1回だけ呼ぶ
 */

function useSessionEvent<T>(subscribe: (listener: (event: T) => void) => () => void): {
  event: T | null;
  loading: boolean;
} {
  const [event, setEvent] = useState<T | null>(null);
  const [received, setReceived] = useState(false);
  useEffect(() => {
    // 初回イベント到着までloading扱い。到着後は受信済みフラグでloadingを確定させる。
    // ここでeventをnullへ戻すと再レンダーループの火種になるため、リセットはしない。
    const unsubscribe = subscribe((next) => {
      setReceived(true);
      setEvent(next);
    });
    return unsubscribe;
  }, [subscribe]);
  return { event, loading: !received };
}

export function useLiveBoard(
  boardUrl: string | null,
  options: { source: ChLensLiveSource; intervalMs?: number | null },
): UseLiveBoardResult {
  const session = useMemo(() => {
    if (!boardUrl) return null;
    return new LiveBoardSession(boardUrl, {
      source: options.source,
      intervalMs: options.intervalMs,
    });
  }, [boardUrl, options.source, options.intervalMs]);

  // 安定したsubscribe参照。これが変わるとuseSessionEventのeffectが再実行され、
  // 最悪の場合polling再起動の連鎖（無限リクエスト）に繋がる。
  const subscribe = useCallback(
    (listener: (event: LiveBoardSessionEvent) => void) =>
      session ? session.subscribe(listener) : () => undefined,
    [session],
  );

  const { event, loading } = useSessionEvent(subscribe);

  const refresh = useCallback(() => {
    void session?.refresh().catch((error: unknown) => {
      console.error(`[Chlens Live] board refresh failed: ${boardUrl}`, error);
    });
  }, [boardUrl, session]);
  const stop = useCallback(() => session?.stop(), [session]);

  useEffect(() => {
    if (!session) return;
    void session.start().catch((error: unknown) => {
      console.error(`[Chlens Live] board session start failed: ${boardUrl}`, error);
    });
    return () => session.stop();
  }, [session, boardUrl]);

  if (!session || !event) return { snapshot: null, error: null, loading, refresh, stop };

  if (event.type === "error") {
    return { snapshot: event.snapshot ?? null, error: event.error, loading: false, refresh, stop };
  }
  return { snapshot: event.snapshot, error: null, loading, refresh, stop };
}

export function useLiveThread(
  threadUrl: string | null,
  options: {
    source: ChLensLiveSource;
    owner?: LiveSessionOwner;
    cache?: LiveThreadCache;
    intervalMs?: number;
  },
): UseLiveThreadResult {
  const session = useMemo(() => {
    if (!threadUrl) return null;
    return new LiveThreadSession(threadUrl, {
      source: options.source,
      owner: options.owner,
      cache: options.cache,
      intervalMs: options.intervalMs,
    });
  }, [threadUrl, options.source, options.owner, options.cache, options.intervalMs]);

  const subscribe = useCallback(
    (listener: (event: LiveThreadSessionEvent) => void) =>
      session ? session.subscribe(listener) : () => undefined,
    [session],
  );

  const { event, loading } = useSessionEvent(subscribe);
  const [running, setRunning] = useState(false);
  const [pollingEnabled, setPollingEnabledState] = useState(false);

  const setPollingEnabled = useCallback(
    (enabled: boolean) => {
      setPollingEnabledState(enabled);
      session?.setPollingEnabled(enabled);
    },
    [session],
  );

  const start = useCallback(() => {
    if (!session) return;
    // 変更理由: 再開直後に現在のスクロール位置を確認する前からタイマーを動かさず、
    // ThreadViewが下端ライン内と判定した場合だけ自動更新を許可する。
    setRunning(true);
    setPollingEnabledState(false);
    session.setPollingEnabled(false);
    void session
      .start()
      .then(() => setRunning(session.isRunning))
      .catch((error: unknown) => {
        setRunning(false);
        console.error(`[Chlens Live] thread session start failed: ${threadUrl}`, error);
      });
  }, [session, threadUrl]);

  useEffect(() => {
    if (!session) {
      setRunning(false);
      setPollingEnabledState(false);
      return;
    }
    start();
    return () => session.stop();
  }, [session, start]);

  const refresh = useCallback(() => {
    void session?.refresh().catch((error: unknown) => {
      console.error(`[Chlens Live] thread refresh failed: ${threadUrl}`, error);
    });
  }, [session, threadUrl]);
  const stop = useCallback(() => {
    session?.stop();
    setRunning(false);
    setPollingEnabledState(false);
  }, [session]);

  if (!session || !event) {
    return {
      snapshot: null,
      error: null,
      loading,
      running,
      pollingEnabled,
      start,
      refresh,
      stop,
      setPollingEnabled,
    };
  }
  if (event.type === "error") {
    return {
      snapshot: event.snapshot ?? null,
      error: event.error,
      loading: false,
      running,
      pollingEnabled,
      start,
      refresh,
      stop,
      setPollingEnabled,
    };
  }
  return {
    snapshot: event.snapshot,
    error: null,
    loading,
    running,
    pollingEnabled,
    start,
    refresh,
    stop,
    setPollingEnabled,
  };
}

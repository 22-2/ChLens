import { useEffect, useMemo, useState } from "react";
import { LiveBoardSession, type LiveBoardSessionEvent } from "../live-session/board-session";
import { LiveThreadSession, type LiveThreadSessionEvent } from "../live-session/session";
import type { ChLensLiveSource } from "../live-session/source";
import type { LiveBoardSnapshot, LiveThreadSnapshot } from "../live-session/cache";
import type { LiveSessionOwner } from "../live-session/owner";
import type { LiveThreadCache } from "../live-session/cache";

export interface UseLiveBoardResult {
  snapshot: LiveBoardSnapshot | null;
  error: unknown;
  loading: boolean;
}

export interface UseLiveThreadResult {
  snapshot: LiveThreadSnapshot | null;
  error: unknown;
  loading: boolean;
}

/**
 * LiveBoardSession / LiveThreadSession をReactから安全に使うための薄いhook層。
 *
 * UIはsessionのsubscribe契約だけに依存し、pollingやcacheの詳細を知らない。
 * sessionインスタンスはurl単位でメモ化し、unmount時に必ずstopしてtimer漏れを防ぐ。
 */

function useSessionEvent<T>(subscribe: (listener: (event: T) => void) => () => void): {
  event: T | null;
  loading: boolean;
} {
  const [event, setEvent] = useState<T | null>(null);
  useEffect(() => {
    // 初回refresh完了までloading扱いにするため、最初のイベント到着前はloadingのまま。
    let first = true;
    setEvent(null);
    const unsubscribe = subscribe((next) => {
      first = false;
      setEvent(next);
    });
    return () => {
      unsubscribe();
      void first;
    };
  }, [subscribe]);
  return { event, loading: event === null };
}

export function useLiveBoard(
  boardUrl: string | null,
  options: { source: ChLensLiveSource; intervalMs?: number },
): UseLiveBoardResult {
  // subscribeコールバックの再生成がuseEffect再実行→無限polling再起動になるのを防ぐため
  // sessionごと安定させた関数を渡す（user memory: useCallback安定化パターン）。
  const session = useMemo(() => {
    if (!boardUrl) return null;
    return new LiveBoardSession(boardUrl, {
      source: options.source,
      intervalMs: options.intervalMs,
    });
  }, [boardUrl, options.source, options.intervalMs]);

  const subscribe = (listener: (event: LiveBoardSessionEvent) => void) =>
    session ? session.subscribe(listener) : () => undefined;

  const { event, loading } = useSessionEvent(subscribe);

  useEffect(() => {
    if (!session) return;
    void session.start().catch((error: unknown) => {
      console.error(`[Chlens Live] board session start failed: ${boardUrl}`, error);
    });
    return () => session.stop();
  }, [session, boardUrl]);

  if (!session || !event) return { snapshot: null, error: null, loading };

  if (event.type === "error") {
    return { snapshot: event.snapshot ?? null, error: event.error, loading: false };
  }
  return { snapshot: event.snapshot, error: null, loading };
}

export function useLiveThread(
  threadUrl: string | null,
  options: {
    source: ChLensLiveSource;
    owner?: LiveSessionOwner;
    cache?: LiveThreadCache;
    intervalMs?: number;
  },
): UseLiveThreadResult & { refresh: () => void; stop: () => void } {
  const session = useMemo(() => {
    if (!threadUrl) return null;
    return new LiveThreadSession(threadUrl, {
      source: options.source,
      owner: options.owner,
      cache: options.cache,
      intervalMs: options.intervalMs,
    });
  }, [threadUrl, options.source, options.owner, options.cache, options.intervalMs]);

  const subscribe = (listener: (event: LiveThreadSessionEvent) => void) =>
    session ? session.subscribe(listener) : () => undefined;

  const { event, loading } = useSessionEvent(subscribe);

  useEffect(() => {
    if (!session) return;
    void session.start().catch((error: unknown) => {
      console.error(`[Chlens Live] thread session start failed: ${threadUrl}`, error);
    });
    return () => session.stop();
  }, [session, threadUrl]);

  const refresh = () =>
    void session?.refresh().catch((error: unknown) => {
      console.error(`[Chlens Live] thread refresh failed: ${threadUrl}`, error);
    });
  const stop = () => session?.stop();

  if (!session || !event) {
    return { snapshot: null, error: null, loading, refresh, stop };
  }
  if (event.type === "error") {
    return { snapshot: event.snapshot ?? null, error: event.error, loading: false, refresh, stop };
  }
  return { snapshot: event.snapshot, error: null, loading, refresh, stop };
}

import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface ResponseNumber {
  num: number;
}

// waiting: 自動更新ON直後の再取得を待っている, fetching: その再取得中。
type CatchUpPhase = "none" | "waiting" | "fetching";

interface PlaybackState {
  scope: string;
  baseline: number | null;
  released: number | null;
  catchUp: CatchUpPhase;
}

// 一時停止から復帰したときだけ、長時間の未表示分をすぐ表示して末尾を流す。
// 通常の更新では件数だけで追いつき処理を行うと、速いスレの表示速度が頭打ちになる。
export const LIVE_CHAT_MAX_PENDING = 30;
export const LIVE_CHAT_TAIL_COUNT = 10;

// 少数の新着は待たせすぎず、多いときは実際の取得間隔と新着数からペースを決める。
export function getLiveChatDelay(pendingCount: number, intervalMs: number): number {
  return Math.min(600, Math.max(1, intervalMs) / Math.max(1, pendingCount));
}

// 高速時は描画間隔ごとに複数件をまとめ、1フレーム1レスの速度制限を避ける。
const MIN_LIVE_CHAT_TICK_MS = 16;

function releaseAll(playback: PlaybackState, lastNum: number | null): PlaybackState {
  return { ...playback, baseline: lastNum, released: lastNum, catchUp: "none" };
}

// 自動更新ON直後の再取得は、OFFの間に溜まった分の取り込みなので流さずに追いつく。
// 再取得はONを反映したeffectから始まるため、ONの描画時点ではまだloadingになっていない。
function advanceCatchUp(
  playback: PlaybackState,
  lastNum: number | null,
  isFetching: boolean,
): PlaybackState {
  if (playback.catchUp === "none") return playback;
  if (playback.released !== lastNum) return releaseAll(playback, lastNum);
  if (playback.catchUp === "waiting" && isFetching) return { ...playback, catchUp: "fetching" };
  // 新着なしで取得が終わったら、以降の新着は通常どおり流す。
  if (playback.catchUp === "fetching" && !isFetching) return { ...playback, catchUp: "none" };
  return playback;
}

export function useLiveChatResponses<T extends ResponseNumber>({
  responses,
  scopeKey,
  enabled,
  isActive,
  isAutoRefreshEnabled,
  isFetching,
  intervalMs,
  paused = false,
}: {
  responses: T[];
  scopeKey: string;
  enabled: boolean;
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  isFetching: boolean;
  intervalMs: number;
  /** ポップアップを読んでいる間など、保留した新着を残して再生だけを止める。 */
  paused?: boolean;
}) {
  const { window: viewWindow } = useViewSurface();
  // タイマーのcleanup前に予約済みのcallbackが届いても、一時停止後の行を表示しない。
  const pausedRef = useLatestRef(paused);
  // 流すのは自動更新で追いかけている最中だけ。手動更新やdat落ち後の取得、非表示の間に
  // 届いた分は利用者が待つ理由がないため、scopeを切り替えてその場で全件表示する。
  const isFlowing = enabled && isActive && isAutoRefreshEnabled;
  const scope = `${scopeKey}\u0000${isFlowing}`;
  const lastNum = responses.at(-1)?.num ?? null;
  const [stored, setPlayback] = useState<PlaybackState>({
    scope,
    baseline: lastNum,
    released: lastNum,
    catchUp: "none",
  });
  const [wasAutoRefreshEnabled, setWasAutoRefreshEnabled] = useState(isAutoRefreshEnabled);
  if (wasAutoRefreshEnabled !== isAutoRefreshEnabled) {
    setWasAutoRefreshEnabled(isAutoRefreshEnabled);
  }
  const hasJustEnabledAutoRefresh = isAutoRefreshEnabled && !wasAutoRefreshEnabled;
  const [settled, setSettled] = useState({ scope, released: lastNum });
  let playback = stored;
  if (stored.scope !== scope) {
    // 切り替えはその場で全件表示し、新着だけを流す。effectで初期化すると
    // 新スレの描画に旧スレの上限が一度混ざるため、描画前に同じstateを同期する。
    playback = {
      scope,
      baseline: lastNum,
      released: lastNum,
      catchUp: isFlowing && hasJustEnabledAutoRefresh ? "waiting" : "none",
    };
  } else if (stored.baseline === null && lastNum !== null) {
    // 初回取得も全件をすぐ表示する。
    playback = releaseAll(stored, lastNum);
  }
  playback = advanceCatchUp(playback, lastNum, isFetching);

  let pending = isFlowing ? responses.filter((res) => res.num > (playback.released ?? 0)) : [];
  const [wasPaused, setWasPaused] = useState(paused);
  const justResumed = wasPaused && !paused;
  if (wasPaused !== paused) setWasPaused(paused);
  if (justResumed && pending.length > LIVE_CHAT_MAX_PENDING) {
    // 停止中に溜まった古い分は、再開時だけ入場動作を省いて追いつく。
    const skippedNum = pending[pending.length - LIVE_CHAT_TAIL_COUNT - 1].num;
    playback = { ...playback, baseline: skippedNum, released: skippedNum };
    pending = pending.slice(-LIVE_CHAT_TAIL_COUNT);
  }
  if (playback !== stored) setPlayback(playback);
  const pendingRef = useLatestRef(pending);
  const fetchClockRef = useRef<{ scope: string; wasFetching: boolean; completedAt: number | null }>(
    {
      scope,
      wasFetching: isFetching,
      completedAt: null,
    },
  );

  useEffect(() => {
    if (!isFlowing || paused) return;
    // 新しい取得分が加わるとタイマーを作り直し、未表示分を含めてペースを更新する。
    const batch = pendingRef.current;
    if (batch.length === 0) return;
    const clock = fetchClockRef.current;
    const now = viewWindow.performance.now();
    const measuredInterval =
      clock.scope === scope && clock.completedAt !== null ? now - clock.completedAt : intervalMs;
    const delay = getLiveChatDelay(
      batch.length,
      measuredInterval > 0 ? measuredInterval : intervalMs,
    );
    const start = now;
    let emitted = 0;
    let timer: number | undefined;
    const tick = () => {
      if (pausedRef.current) return;
      // タイマーや描画が遅れた分も時刻から計算し、設定した速度に追いつく。
      const elapsed = viewWindow.performance.now() - start;
      const due = Math.min(batch.length, Math.max(emitted + 1, Math.floor(elapsed / delay)));
      emitted = due;
      const released = batch[due - 1].num;
      setPlayback((current) =>
        !pausedRef.current && current.scope === scope
          ? { ...current, released: Math.max(current.released ?? 0, released) }
          : current,
      );
      if (emitted < batch.length) schedule();
    };
    const schedule = () => {
      const remaining = (emitted + 1) * delay - (viewWindow.performance.now() - start);
      timer = viewWindow.setTimeout(tick, Math.max(MIN_LIVE_CHAT_TICK_MS, remaining));
    };
    schedule();
    return () => {
      if (timer !== undefined) viewWindow.clearTimeout(timer);
    };
  }, [scope, lastNum, isFlowing, paused, intervalMs, pendingRef, pausedRef, viewWindow]);

  useEffect(() => {
    const clock = fetchClockRef.current;
    if (clock.scope !== scope) {
      fetchClockRef.current = { scope, wasFetching: isFetching, completedAt: null };
      return;
    }
    if (clock.wasFetching && !isFetching) clock.completedAt = viewWindow.performance.now();
    clock.wasFetching = isFetching;
  }, [scope, isFetching, viewWindow]);

  useEffect(() => {
    // 最後の行の高さをResizeObserverが追従させてから、満了停止や次スレ移動を許可する。
    let secondFrame: number | undefined;
    const frame = viewWindow.requestAnimationFrame(() => {
      secondFrame = viewWindow.requestAnimationFrame(() =>
        setSettled({ scope, released: playback.released }),
      );
    });
    return () => {
      viewWindow.cancelAnimationFrame(frame);
      if (secondFrame !== undefined) viewWindow.cancelAnimationFrame(secondFrame);
    };
  }, [playback.released, scope, viewWindow]);

  return {
    responses: isFlowing
      ? responses.filter((res) => res.num <= (playback.released ?? 0))
      : responses,
    pendingCount: pending.length,
    isFlowing,
    isDraining:
      isFlowing &&
      (pending.length > 0 || settled.scope !== scope || settled.released !== playback.released),
    baseline: playback.baseline ?? 0,
  };
}

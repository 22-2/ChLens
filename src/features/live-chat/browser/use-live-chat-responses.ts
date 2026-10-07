import { useEffect, useState } from "react";
import { useViewSurface } from "src/features/auxiliary-window/browser/use-view-surface";

interface ResponseNumber {
  num: number;
}

interface PlaybackState {
  scope: string;
  baseline: number | null;
  released: number | null;
}

// 取得周期の手前でキューを消化し、勢いの大きいスレでも表示遅延を積み重ねない。
export function getLiveChatDelay(pendingCount: number, intervalMs: number): number {
  return Math.max(16, Math.min(600, (intervalMs * 0.8) / Math.max(1, pendingCount)));
}

export function useLiveChatResponses<T extends ResponseNumber>({
  responses,
  scopeKey,
  enabled,
  isActive,
  intervalMs,
}: {
  responses: T[];
  scopeKey: string;
  enabled: boolean;
  isActive: boolean;
  intervalMs: number;
}) {
  const { window: viewWindow } = useViewSurface();
  const scope = `${scopeKey}\u0000${enabled}`;
  const lastNum = responses.at(-1)?.num ?? null;
  const [stored, setPlayback] = useState<PlaybackState>({
    scope,
    baseline: lastNum,
    released: lastNum,
  });
  const [settled, setSettled] = useState({ scope, released: lastNum });
  let playback = stored;
  if (stored.scope !== scope || (stored.baseline === null && lastNum !== null)) {
    // 切り替えと初回取得はその場で全件表示し、新着だけを流す。effectで初期化すると
    // 新スレの描画に旧スレの上限が一度混ざるため、描画前に同じstateを同期する。
    playback = { scope, baseline: lastNum, released: lastNum };
    setPlayback(playback);
  }

  const pending = enabled ? responses.filter((res) => res.num > (playback.released ?? 0)) : [];
  const nextNum = pending[0]?.num;
  // バッチ内では一定間隔を保つ。残り件数が減るたびに間隔を延ばすと、最後尾が次回取得に間に合わない。
  const [pace, setPace] = useState({
    scope,
    lastNum,
    delay: getLiveChatDelay(pending.length, intervalMs),
  });
  let delay = pace.delay;
  if (pace.scope !== scope || pace.lastNum !== lastNum) {
    delay = getLiveChatDelay(pending.length, intervalMs);
    setPace({ scope, lastNum, delay });
  }

  useEffect(() => {
    if (!enabled || !isActive || nextNum === undefined) return;
    const timer = viewWindow.setTimeout(() => {
      setPlayback((current) =>
        current.scope === scope ? { ...current, released: nextNum } : current,
      );
    }, delay);
    // 非表示化・通常表示への切り替え・次スレ移動で予約を破棄し、旧スレのレスを混ぜない。
    return () => viewWindow.clearTimeout(timer);
  }, [delay, enabled, isActive, nextNum, scope, viewWindow]);

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
    responses: enabled ? responses.filter((res) => res.num <= (playback.released ?? 0)) : responses,
    pendingCount: pending.length,
    isDraining:
      enabled &&
      (pending.length > 0 || settled.scope !== scope || settled.released !== playback.released),
    baseline: playback.baseline ?? 0,
  };
}

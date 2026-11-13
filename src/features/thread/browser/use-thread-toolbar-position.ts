import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigNumberSetting } from "src/view/browser/hooks/use-config-number-setting";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

const POSITION_KEY = "thread_toolbar_position";
const DEFAULT_POSITION = 0.8;
const KEYBOARD_SAVE_DELAY_MS = 250;

function clampPosition(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_POSITION;
}

/** 表示中は即座に動かし、ドラッグ完了またはキー操作の終了後に位置を保存する。 */
export function useThreadToolbarPosition() {
  const { window: viewWindow } = useViewSurface();
  const { value: storedPosition, setValue: persistPosition } = useConfigNumberSetting(
    POSITION_KEY,
    DEFAULT_POSITION,
  );
  const [position, setPosition] = useState(() => clampPosition(storedPosition));
  const positionRef = useRef(position);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // 他ペインや起動時の設定復元は、移動操作中の位置を上書きしない。
    if (dirtyRef.current) return;
    const next = clampPosition(storedPosition);
    positionRef.current = next;
    setPosition(next);
  }, [storedPosition]);

  const commit = useCallback(() => {
    if (timerRef.current !== null) {
      viewWindow.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    persistPosition(positionRef.current);
  }, [persistPosition, viewWindow]);

  const move = useCallback(
    (value: number, keyboard = false) => {
      const next = clampPosition(value);
      if (next === positionRef.current) return;
      positionRef.current = next;
      dirtyRef.current = true;
      setPosition(next);
      if (timerRef.current !== null) {
        viewWindow.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (keyboard) timerRef.current = viewWindow.setTimeout(commit, KEYBOARD_SAVE_DELAY_MS);
    },
    [commit, viewWindow],
  );

  // 連続キー入力中に画面を閉じても最後の位置を失わない。
  useEffect(() => {
    viewWindow.addEventListener("pagehide", commit);
    return () => {
      viewWindow.removeEventListener("pagehide", commit);
      commit();
    };
  }, [commit, viewWindow]);
  return { position, move, commit };
}

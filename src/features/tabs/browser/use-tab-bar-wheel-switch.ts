import normalizeWheel from "normalize-wheel";
import { type RefObject, useCallback, useEffect, useRef } from "react";

const TAB_SWITCH_WHEEL_DISTANCE_THRESHOLD = 1.5;
const TAB_SWITCH_WHEEL_BASE_COOLDOWN_MS = 150;

/** タブバー上のホイールで、選択タブを前後に切り替える。 */
export function useTabBarWheelSwitch(
  barRef: RefObject<HTMLDivElement | null>,
  onStepTab: (delta: 1 | -1) => boolean,
): void {
  const lastWheelSwitchAtRef = useRef(0);

  // ホイールは一覧のスクロールに使わず、選択タブを前後に切り替えるためだけに使う。
  // 一覧のスクロールはスクロールバーで行う。
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // 変更理由: 閾値未満や冷却中の入力でも既定のスクロールを起こさないよう、
      // 切り替えの判定より前に既定の動作を止める。
      e.preventDefault();
      const normalizedWheel = normalizeWheel(e);
      const wheelDistance = normalizedWheel.pixelX + normalizedWheel.pixelY;
      if (Math.abs(wheelDistance) < TAB_SWITCH_WHEEL_DISTANCE_THRESHOLD) {
        return;
      }

      const now = Date.now();
      const cooldownMs = Math.max(
        0,
        TAB_SWITCH_WHEEL_BASE_COOLDOWN_MS -
          2 * (Math.abs(normalizedWheel.pixelX) + Math.abs(normalizedWheel.pixelY)),
      );
      if (now - lastWheelSwitchAtRef.current < cooldownMs) {
        return;
      }

      // 変更理由: ブラウザごとの生の delta 符号差を normalize-wheel で吸収し、
      // 正規化後に正なら下/右、負なら上/左として一貫して扱う。
      const delta = wheelDistance > 0 ? 1 : -1;
      if (!onStepTab(delta)) {
        return;
      }
      lastWheelSwitchAtRef.current = now;
    },
    [onStepTab],
  );

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const nativeHandler = (ev: WheelEvent) => handleWheel(ev);
    el.addEventListener("wheel", nativeHandler, { passive: false });
    return () => {
      el.removeEventListener("wheel", nativeHandler);
    };
  }, [handleWheel]);
}

import { useCallback, useRef } from "react";
import type React from "react";

const POPUP_KEEP_OPEN_TARGET_SELECTOR = "a, .res__link, .res__thumb";
const POPUP_MOUSELEAVE_SUPPRESS_MS = 250;

export function usePopupSurfaceCloseGuard(onSurfaceMouseDown?: () => void) {
  const suppressCloseUntilRef = useRef(0);
  const suppressNextMouseLeaveRef = useRef(false);

  const armMouseLeaveCloseSuppression = useCallback(() => {
    // middle click 後の close はブラウザやデバイス差で発火タイミングが揺れるため、
    // 時間窓だけでなく「次の mouseleave を1回だけ必ず無視」するガードを併用する。
    suppressNextMouseLeaveRef.current = true;
    suppressCloseUntilRef.current = Date.now() + POPUP_MOUSELEAVE_SUPPRESS_MS;
  }, []);

  const handleMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      onSurfaceMouseDown?.();

      if (event.button !== 1) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        return;
      }

      // 中クリックで新規タブを開く瞬間はブラウザ側のフォーカス/hover判定が揺れて
      // mouseleave が先に飛ぶことがあるため、その直後だけ自動 close を抑止する。
      armMouseLeaveCloseSuppression();
    },
    [armMouseLeaveCloseSuppression, onSurfaceMouseDown],
  );

  const shouldSuppressMouseLeaveClose = useCallback(() => {
    if (suppressNextMouseLeaveRef.current) {
      suppressNextMouseLeaveRef.current = false;
      return true;
    }
    return suppressCloseUntilRef.current > Date.now();
  }, []);

  const handleAuxClickCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 1) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        return;
      }

      armMouseLeaveCloseSuppression();
    },
    [armMouseLeaveCloseSuppression],
  );

  return {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    shouldSuppressMouseLeaveClose,
  };
}

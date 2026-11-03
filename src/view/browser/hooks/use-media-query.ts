import { useCallback, useSyncExternalStore } from "react";

function readMatchMedia(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/**
 * Mantineへ依存せず、ブラウザのmedia query状態を購読する小さなhook。
 * 変更理由: 購読の初期値を effect で set すると描画が一度余計に走るため、外部ストアとして読む。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      return () => {
        mediaQuery.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  const getSnapshot = useCallback(() => readMatchMedia(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

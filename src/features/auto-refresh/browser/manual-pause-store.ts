import { useEffect } from "react";
import { create } from "zustand";

interface ManualPauseStore {
  paused: Record<string, boolean>;
  setPaused: (key: string, paused: boolean) => void;
}

// タブとスレッドを組にして、別タブや次スレへ一時停止を持ち越さない。
export function manualPauseKey(tabId: string, threadUrl: string): string {
  return JSON.stringify([tabId, threadUrl]);
}

export const useManualPauseStore = create<ManualPauseStore>((set) => ({
  paused: {},
  setPaused: (key, paused) =>
    set((state) => {
      const next = { ...state.paused };
      if (paused) next[key] = true;
      else delete next[key];
      return { paused: next };
    }),
}));

export function useManualThreadPause(tabId: string, threadUrl: string, enabled: boolean): boolean {
  const key = manualPauseKey(tabId, threadUrl);
  const paused = useManualPauseStore((state) => !!state.paused[key]);
  const setPaused = useManualPauseStore((state) => state.setPaused);
  // OFFから再開したときに、前回の手動停止を引き継がない。
  useEffect(() => {
    if (!enabled && paused) setPaused(key, false);
  }, [enabled, key, paused, setPaused]);
  return enabled && paused;
}

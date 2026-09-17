import { create } from "zustand";

import type { ArchiveReplayMainThreadRequest } from "../platform";

// ThreadViewの取得完了より先に届く位置も保持し、マウント後にラインと追従を復元する。
export const useArchiveReplayPositionStore = create<{
  position: (ArchiveReplayMainThreadRequest & { tabId: string }) | null;
}>(() => ({ position: null }));

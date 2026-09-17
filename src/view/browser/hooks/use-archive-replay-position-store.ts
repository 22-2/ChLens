import type { ArchiveReplayMainThreadRequest } from "src/features/comment-overlay/platform";
import { create } from "zustand";

// ThreadViewの取得完了より先に届く位置も保持し、マウント後にラインと追従を復元する。
export const useArchiveReplayPositionStore = create<{
  position: (ArchiveReplayMainThreadRequest & { tabId: string }) | null;
}>(() => ({ position: null }));

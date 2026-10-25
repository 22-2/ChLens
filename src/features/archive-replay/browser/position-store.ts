import { create } from "zustand";

import { normalizeArchiveReplayThreadUrl } from "../domain";
import type { ArchiveReplayMainThreadRequest } from "../platform";

// ThreadViewの取得完了より先に届く位置も保持し、マウント後にラインと追従を復元する。
export type ArchiveReplayPosition = ArchiveReplayMainThreadRequest & { tabId: string };

export const useArchiveReplayPositionStore = create<{
  position: ArchiveReplayPosition | null;
}>(() => ({ position: null }));

/** 再生位置を同期した専用ThreadViewかどうかを、タブと正規化URLの両方で判定する。 */
export function isArchiveReplayThread(
  position: ArchiveReplayPosition | null,
  tabId: string,
  threadUrl: string,
): boolean {
  return (
    position?.tabId === tabId &&
    normalizeArchiveReplayThreadUrl(position.threadUrl) ===
      normalizeArchiveReplayThreadUrl(threadUrl)
  );
}

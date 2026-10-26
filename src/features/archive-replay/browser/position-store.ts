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

export interface ArchiveReplayThreadCapabilities {
  /** 再生位置に対応する専用ThreadViewかどうか。 */
  isReadOnly: boolean;
  canRefresh: boolean;
  canAutoRefresh: boolean;
  canAutoAdvance: boolean;
  canWrite: boolean;
  canControlLiveOverlay: boolean;
  canShowMomentum: boolean;
}

/**
 * 過去実況スレッドで許可する操作を一か所で決める。
 * 位置同期だけでは通常スレッドのタブ状態が残る場合があるため、
 * タブとURLの一致を確認してから読み取り専用の能力を返す。
 */
export function getArchiveReplayThreadCapabilities(
  position: ArchiveReplayPosition | null,
  tabId: string,
  threadUrl: string,
): ArchiveReplayThreadCapabilities {
  const isReadOnly = isArchiveReplayThread(position, tabId, threadUrl);
  const canInteractWithLiveThread = !isReadOnly;

  return {
    isReadOnly,
    canRefresh: canInteractWithLiveThread,
    canAutoRefresh: canInteractWithLiveThread,
    canAutoAdvance: canInteractWithLiveThread,
    canWrite: canInteractWithLiveThread,
    canControlLiveOverlay: canInteractWithLiveThread,
    canShowMomentum: canInteractWithLiveThread,
  };
}

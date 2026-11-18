import React from "react";
import type { PendingAutoNextThreadMove } from "src/features/next-thread/browser/use-auto-next-thread";
import type { ThreadSearchCandidate } from "src/features/next-thread/domain/next-thread-search";
import { NextThreadSearchDialog } from "src/features/next-thread/ui/NextThreadSearchDialog";

interface PendingNextThreadDialogProps {
  move: PendingAutoNextThreadMove;
  onClose: () => void;
  onSelect: (candidate: ThreadSearchCandidate) => void;
}

/** 自動で次スレへ移動する前に、候補とカウントダウンを確認用のダイアログで示す。 */
export const PendingNextThreadDialog: React.FC<PendingNextThreadDialogProps> = ({
  move,
  onClose,
  onSelect,
}) => (
  <NextThreadSearchDialog
    state={{
      status: "ready",
      searchType: "next",
      sourceThread: move.sourceThread,
      candidates: move.candidates,
      boardMessage: null,
      error: null,
    }}
    autoMoveCountdown={move.remainingSeconds}
    onClose={onClose}
    onSelect={onSelect}
  />
);

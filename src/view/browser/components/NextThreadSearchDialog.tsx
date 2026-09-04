import React, { useEffect, useState } from "react";
import type { NextThreadSearchState } from "src/view/browser/hooks/use-next-thread-search";
import { Dialog } from "src/view/browser/ui/Dialog";
import { Spinner } from "src/view/browser/ui/Spinner";
import type {
  NextThreadEvidence,
  NextThreadMatch,
} from "src/view/browser/utils/next-thread-search";

interface NextThreadSearchDialogProps {
  state: NextThreadSearchState;
  onClose: () => void;
  onSelect: (candidate: NextThreadMatch) => void;
}

const EVIDENCE_LABELS: Partial<Record<NextThreadEvidence, string>> = {
  "explicit-link": "本文リンク",
  "exact-adjacent-number": "連番",
  "exact-next-number": "次番号",
  "nearby-next-number": "近い番号",
  "same-base-title": "同系統タイトル",
  "near-title": "近いタイトル",
  "same-title": "同じタイトル",
  "similar-title": "類似タイトル",
  "newer-thread": "新しいスレ",
  "active-thread": "稼働中",
};

function getEvidenceLabels(candidate: NextThreadMatch): string[] {
  return (candidate.reasons ?? [])
    .map((reason) => EVIDENCE_LABELS[reason])
    .filter((label): label is string => label != null);
}

function formatSimilarity(similarity: number): string {
  return String(Math.round(similarity * 100)) + "%";
}

export const NextThreadSearchDialog: React.FC<NextThreadSearchDialogProps> = ({
  state,
  onClose,
  onSelect,
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const isOpen = state.status !== "idle";
  const isSearching = state.status === "searching";
  const isReady = state.status === "ready";
  const isError = state.status === "error";

  useEffect(() => {
    // テーマトークンは `.browser-shell[data-theme]` にスコープされるため、
    // body直下のPortalではダークテーマのsurface/textを継承できない。
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content className="browser-dialog-content next-thread-search-dialog__content">
          <Dialog.Title className="browser-dialog-title">次スレ候補を検索</Dialog.Title>
          <Dialog.Description className="browser-dialog-description">
            「{state.sourceThread?.title ?? "現在のスレ"}」を基準に、積極判定の候補を表示します
          </Dialog.Description>

          {isSearching ? (
            <div className="next-thread-search-dialog__status" role="status">
              <Spinner size="sm" aria-label="次スレ候補を検索中" />
              <span>板のスレ一覧を検索中...</span>
            </div>
          ) : null}

          {isError ? (
            <p className="next-thread-search-dialog__error" role="alert">
              {state.error}
            </p>
          ) : null}

          {isReady && state.candidates.length > 0 ? (
            <ol className="next-thread-search-dialog__candidate-list" aria-label="次スレ候補一覧">
              {state.candidates.map((candidate, index) => {
                const evidenceLabels = getEvidenceLabels(candidate);
                return (
                  <li key={candidate.thread.url}>
                    <button
                      type="button"
                      className="next-thread-search-dialog__candidate"
                      onClick={() => onSelect(candidate)}
                      aria-label={candidate.thread.title + "へ移動"}
                    >
                      <span className="next-thread-search-dialog__rank">{index + 1}</span>
                      <span className="next-thread-search-dialog__candidate-body">
                        <span className="next-thread-search-dialog__candidate-title">
                          {candidate.thread.title}
                        </span>
                        <span className="next-thread-search-dialog__candidate-meta">
                          {candidate.thread.resCount.toLocaleString("ja-JP")}レス ・ 一致度{" "}
                          {formatSimilarity(candidate.similarity)}
                          {candidate.score != null ? (
                            <>
                              {" ・ スコア "}
                              <span className="next-thread-search-dialog__candidate-score">
                                {Math.round(candidate.score)}
                              </span>
                            </>
                          ) : null}
                        </span>
                        {evidenceLabels.length > 0 ? (
                          <span className="next-thread-search-dialog__candidate-evidence">
                            {evidenceLabels.join(" / ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {isReady && state.candidates.length === 0 ? (
            <div className="next-thread-search-dialog__status">
              <span>次スレ候補は見つかりませんでした。</span>
              {state.boardMessage ? <span>{state.boardMessage}</span> : null}
            </div>
          ) : null}

          <div className="next-thread-search-dialog__actions">
            <button
              type="button"
              className="browser-button"
              data-variant="subtle"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

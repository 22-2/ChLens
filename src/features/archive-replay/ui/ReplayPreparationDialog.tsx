import "./ReplayPreparationDialog.css";

import { useState } from "react";
import { createLogger } from "src/app/logger";
import {
  fetchEdgeArchive,
  fetchEdgeCurrentThreads,
} from "src/features/archive-replay/browser/edge-archive-source";
import { parseArchiveReplayStartInput } from "src/features/archive-replay/domain/archive-replay";
import {
  collectThreadCandidates,
  defaultCollectionQuery,
} from "src/features/archive-replay/domain/thread-collection/candidate-matching";
import { collectionWindowFromSeed } from "src/features/archive-replay/domain/thread-collection/collection-window";
import {
  DEFAULT_THREAD_COLLECTION_PARAMS,
  type ThreadCollectionCandidate,
  type ThreadCollectionSeed,
} from "src/features/archive-replay/domain/thread-collection/types";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";

const logger = createLogger("archive-replay");

export function formatCollectionInput(seconds: number): string {
  return new Date(seconds * 1000 + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

interface Props {
  seed?: ThreadCollectionSeed;
  initialTitle?: string;
  initialRange?: { startSeconds: number; endSeconds: number };
  onClose: () => void;
  onApply: (candidates: readonly ThreadCollectionCandidate[], query: string) => void;
}

export function ReplayPreparationDialog({
  seed,
  initialTitle,
  initialRange,
  onClose,
  onApply,
}: Props) {
  const range =
    initialRange ??
    (seed ? collectionWindowFromSeed(seed, DEFAULT_THREAD_COLLECTION_PARAMS) : undefined);
  const [query, setQuery] = useState(defaultCollectionQuery(seed?.title ?? initialTitle ?? ""));
  const [start, setStart] = useState(range ? formatCollectionInput(range.startSeconds) : "");
  const [end, setEnd] = useState(range ? formatCollectionInput(range.endSeconds) : "");
  const [candidates, setCandidates] = useState<ThreadCollectionCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  function clearResults() {
    // 検索条件を書き換えたあとに古い候補を確定しないよう、結果も破棄する。
    setCandidates([]);
    setSelected(new Set());
    setSearched(false);
    setMessages([]);
  }

  async function search() {
    clearResults();
    const startAt = parseArchiveReplayStartInput(start);
    const endAt = parseArchiveReplayStartInput(end);
    if (!query.trim() || startAt === null || endAt === null || startAt > endAt) {
      setMessages(["検索語と日時の範囲を確認してください。"]);
      return;
    }
    setLoading(true);
    setMessages([]);
    try {
      const [archive, current] = await Promise.allSettled([
        fetchEdgeArchive(query, startAt / 1000, endAt / 1000),
        fetchEdgeCurrentThreads(),
      ]);
      const notices: string[] = [];
      if (archive.status === "rejected") {
        logger.error("過去ログ索引の取得に失敗しました", archive.reason);
        notices.push("過去ログ索引を取得できませんでした。");
      } else {
        notices.push(...archive.value.failures);
        if (archive.value.matchingTruncated)
          notices.push(
            "検索語に一致するスレが多いため一部のみ表示しています。日時を絞ってください。",
          );
        if (archive.value.broadTruncated)
          notices.push(
            "続きの可能性があるスレは一部のみ調べました。日時を絞ると他にも見つかる場合があります。",
          );
      }
      if (current.status === "rejected") {
        logger.error("現行スレ一覧の取得に失敗しました", current.reason);
        notices.push("現行スレ一覧を取得できませんでした。");
      }
      const listings = [
        ...(archive.status === "fulfilled" ? archive.value.threads : []),
        ...(current.status === "fulfilled" ? current.value : []),
      ];
      const result = collectThreadCandidates(
        listings,
        query,
        // 入力は分単位なので、終了分の59秒までを検索対象に含める。
        { startSeconds: startAt / 1000, endSeconds: endAt / 1000 + 59 },
        DEFAULT_THREAD_COLLECTION_PARAMS,
        seed,
      );
      setCandidates(result);
      setSelected(
        new Set(
          result
            .filter(
              (item) => item.score >= DEFAULT_THREAD_COLLECTION_PARAMS.defaultCheckedThreshold,
            )
            .map((item) => item.listing.threadUrl),
        ),
      );
      setMessages(notices);
      setSearched(true);
    } catch (error) {
      logger.error("候補の判定に失敗しました", error);
      setMessages(["候補を判定できませんでした。条件を確認してやり直してください。"]);
    } finally {
      setLoading(false);
    }
  }

  const chosen = candidates.filter((item) => selected.has(item.listing.threadUrl));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content className="browser-dialog-content replay-preparation">
          <Dialog.Title>リプレイ準備</Dialog.Title>
          <Dialog.Description>
            エッヂの候補を確認して、再生するスレを選んでください。
          </Dialog.Description>
          <div className="replay-preparation__fields">
            <label className="archive-replay-window__field">
              <span>検索語</span>
              <input
                disabled={loading}
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  clearResults();
                }}
              />
            </label>
            <label className="archive-replay-window__field">
              <span>開始日時（日本時間）</span>
              <input
                type="datetime-local"
                disabled={loading}
                value={start}
                onChange={(event) => {
                  setStart(event.currentTarget.value);
                  clearResults();
                }}
              />
            </label>
            <label className="archive-replay-window__field">
              <span>終了日時（日本時間）</span>
              <input
                type="datetime-local"
                disabled={loading}
                value={end}
                onChange={(event) => {
                  setEnd(event.currentTarget.value);
                  clearResults();
                }}
              />
            </label>
            <Button type="button" loading={loading} onClick={() => void search()}>
              候補を集める
            </Button>
          </div>
          <p className="archive-replay-window__note">
            検索対象はエッヂです。題名が似たスレも候補に含むため、内容を確認して選んでください。
          </p>
          {messages.map((message) => (
            <p role="status" key={message}>
              {message}
            </p>
          ))}
          {searched && !candidates.length && !messages.length ? (
            <p>候補が見つかりませんでした。</p>
          ) : null}
          <div className="replay-preparation__list">
            {candidates.map((candidate) => (
              <label
                className="replay-preparation__candidate"
                key={candidate.listing.threadUrl}
                title={candidate.reasons.join("、")}
              >
                <input
                  type="checkbox"
                  checked={selected.has(candidate.listing.threadUrl)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (checked) next.add(candidate.listing.threadUrl);
                      else next.delete(candidate.listing.threadUrl);
                      return next;
                    });
                  }}
                />
                <span>
                  <time>
                    {formatCollectionInput(candidate.listing.createdAtSeconds).replace("T", " ")}
                  </time>{" "}
                  {candidate.listing.title}{" "}
                  {candidate.listing.responseCount === undefined
                    ? ""
                    : `(${candidate.listing.responseCount}レス)`}
                  <small>
                    {candidate.kind === "seed"
                      ? "種スレ"
                      : candidate.kind === "search-match"
                        ? "検索語一致（要確認）"
                        : "続きの可能性（要確認）"}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="replay-preparation__actions">
            <span>選択: {chosen.length}件</span>
            <Button type="button" variant="subtle" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="button" disabled={!chosen.length} onClick={() => onApply(chosen, query)}>
              この内容を使う
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

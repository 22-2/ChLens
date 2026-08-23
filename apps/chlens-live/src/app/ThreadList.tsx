import type { BoardThread } from "@chlen/ch-lib";
import { useMemo, useState } from "react";

export interface ThreadListProps {
  threads: BoardThread[];
  loading: boolean;
  error: unknown;
  selectedUrl: string | null;
  onSelect: (thread: BoardThread) => void;
}

function formatResCount(count: number): string {
  return `${count}レス`;
}

/**
 * 板のスレ一覧（subject.txt）を表示するThreadList UI。
 *
 * Phase 2では取得境界（LiveBoardSession）の可視化が目的のため、
 * ソート・検索などの製品仕様は持たず、選択通知だけを行う。
 */
export function ThreadList({ threads, loading, error, selectedUrl, onSelect }: ThreadListProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => thread.title.toLowerCase().includes(normalized));
  }, [threads, query]);

  if (error) {
    return (
      <div className="thread-list__error" role="alert">
        スレ一覧の取得に失敗しました
      </div>
    );
  }

  if (loading && threads.length === 0) {
    return <div className="thread-list__loading">読み込み中…</div>;
  }

  return (
    <div className="thread-list">
      <input
        className="thread-list__filter"
        type="search"
        placeholder="タイトルで絞り込み"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="スレタイトル絞り込み"
      />
      {filtered.length === 0 ? (
        <div className="thread-list__empty">該当するスレはありません</div>
      ) : (
        <ul className="thread-list__items" role="listbox" aria-label="スレ一覧">
          {filtered.map((thread) => (
            <li key={thread.url}>
              <button
                type="button"
                role="option"
                aria-selected={thread.url === selectedUrl}
                className={
                  thread.url === selectedUrl
                    ? "thread-list__item thread-list__item--selected"
                    : "thread-list__item"
                }
                onClick={() => onSelect(thread)}
              >
                <span className="thread-list__title">{thread.title}</span>
                <span className="thread-list__meta">{formatResCount(thread.resCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

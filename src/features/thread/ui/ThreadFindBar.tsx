import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { UseThreadFindResult } from "src/features/thread/browser/use-thread-find";
import { getSearchError, SearchOptionsMenu } from "src/view/browser/components/SearchOptionsMenu";

interface ThreadFindBarProps {
  find: Pick<
    UseThreadFindResult,
    | "query"
    | "setQuery"
    | "options"
    | "setOptions"
    | "total"
    | "activeIndex"
    | "focusKey"
    | "next"
    | "previous"
    | "close"
  >;
}

/**
 * スレッドのページ内検索バー。Enter で次、Shift+Enter で前の一致へ移り、Esc で閉じる。
 */
export function ThreadFindBar({ find }: ThreadFindBarProps) {
  const { query, options, total, activeIndex, focusKey } = find;
  const onQueryChange = find.setQuery;
  const onOptionsChange = find.setOptions;
  const onNext = find.next;
  const onPrevious = find.previous;
  const onClose = find.close;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ctrl+F を押し直したときも、入力済みの語を選択して打ち直せるようにする。
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [focusKey]);

  const hasQuery = query.trim() !== "";
  const searchError = getSearchError(query, options);
  const status = !hasQuery ? "" : total === 0 ? "一致なし" : `${activeIndex + 1} / ${total}`;

  return (
    <div className="thread-find-bar" role="search">
      <input
        ref={inputRef}
        type="text"
        className="thread-find-bar__input"
        placeholder="スレッド内を検索"
        aria-label="スレッド内を検索"
        aria-invalid={searchError ? true : undefined}
        title={searchError ?? undefined}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrevious();
            else onNext();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <SearchOptionsMenu options={options} onChange={onOptionsChange} />
      <span
        className={`thread-find-bar__status${
          hasQuery && total === 0 ? " thread-find-bar__status--empty" : ""
        }`}
        aria-live="polite"
      >
        {status}
      </span>
      <button
        type="button"
        className="thread-find-bar__button"
        aria-label="前の一致"
        title="前の一致 (Shift+Enter)"
        disabled={total === 0}
        onClick={onPrevious}
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="thread-find-bar__button"
        aria-label="次の一致"
        title="次の一致 (Enter)"
        disabled={total === 0}
        onClick={onNext}
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="thread-find-bar__button"
        aria-label="検索を閉じる"
        title="閉じる (Esc)"
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

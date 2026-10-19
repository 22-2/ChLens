import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ThreadFindBarProps {
  query: string;
  total: number;
  /** 0始まり。一致がなければ -1。 */
  activeIndex: number;
  focusKey: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

/**
 * スレッドのページ内検索バー。Enter で次、Shift+Enter で前の一致へ移り、Esc で閉じる。
 */
export function ThreadFindBar({
  query,
  total,
  activeIndex,
  focusKey,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: ThreadFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ctrl+F を押し直したときも、入力済みの語を選択して打ち直せるようにする。
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [focusKey]);

  const hasQuery = query.trim() !== "";
  const status = !hasQuery ? "" : total === 0 ? "一致なし" : `${activeIndex + 1} / ${total}`;

  return (
    <div className="thread-find-bar" role="search">
      <input
        ref={inputRef}
        type="text"
        className="thread-find-bar__input"
        placeholder="スレッド内を検索"
        aria-label="スレッド内を検索"
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

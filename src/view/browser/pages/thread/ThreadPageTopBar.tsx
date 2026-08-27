import React, { useEffect, useRef } from "react";
import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";
import type { ThreadFilter, ThreadSearchTarget } from "src/view/browser/types";

interface ThreadPageTopBarProps {
  activeTopBar: TopBarMode;
  filter: ThreadFilter;
  filteredResponseCount: number;
  onClose: () => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchTargetChange: (searchTarget: ThreadSearchTarget) => void;
  onSearchQueryChange: (query: string) => void;
  responseCount: number;
  searchFocusKey: number;
  searchQuery: string;
  searchTarget: ThreadSearchTarget;
}

const FILTER_BUTTONS: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "popular", label: "多レス" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "link", label: "リンク" },
];

const SEARCH_TARGETS: { key: ThreadSearchTarget; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "body", label: "本文" },
  { key: "name", label: "名前" },
  { key: "id", label: "ID" },
];

export const ThreadPageTopBar: React.FC<ThreadPageTopBarProps> = ({
  activeTopBar,
  filter,
  filteredResponseCount,
  onClose,
  onFilterChange,
  onSearchTargetChange,
  onSearchQueryChange,
  responseCount,
  searchFocusKey,
  searchQuery,
  searchTarget,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const topBarCountLabel = `${filteredResponseCount}/${responseCount}件`;

  useEffect(() => {
    if (activeTopBar === "none") {
      return;
    }

    // スクロール途中でツールバーを開いても input focus による scroll jump を起こしにくくする。
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
  }, [activeTopBar, searchFocusKey]);

  // ThreadPage本体は「バーを出すか」だけを判断し、
  // 検索とフィルタの複合UIは専用コンポーネントへ閉じ込めて見通しを保つ。
  if (activeTopBar === "none") {
    return null;
  }

  return (
    <div className="thread-page__top-bar thread-page__toolbar">
      <div className="thread-page__toolbar-main">
        <div className="thread-page__filters">
          {FILTER_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              className={`thread-page__filter-btn${
                filter === key ? " thread-page__filter-btn--active" : ""
              }`}
              onClick={() => onFilterChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="thread-page__toolbar-search">
          <select
            className="thread-page__toolbar-search-target"
            aria-label="検索対象"
            value={searchTarget}
            onChange={(event) => onSearchTargetChange(event.target.value as ThreadSearchTarget)}
          >
            {SEARCH_TARGETS.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="text"
            className="thread-page__toolbar-search-input"
            placeholder="検索..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
      </div>
      <div className="thread-page__toolbar-right">
        <span className="thread-page__count">{topBarCountLabel}</span>
        <button
          type="button"
          className="thread-page__toolbar-close"
          onClick={onClose}
          aria-label="フィルターを閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

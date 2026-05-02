import React from "react";
import { SearchBar } from "src/view/browser/components/SearchBar";
import type { ThreadFilter } from "src/view/browser/utils/types";

import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";

interface ThreadPageTopBarProps {
  activeTopBar: TopBarMode;
  filter: ThreadFilter;
  filteredResponseCount: number;
  onClose: () => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchQueryChange: (query: string) => void;
  responseCount: number;
  searchQuery: string;
}

const FILTER_BUTTONS: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "popular", label: "多レス" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "link", label: "リンク" },
];

export const ThreadPageTopBar: React.FC<ThreadPageTopBarProps> = ({
  activeTopBar,
  filter,
  filteredResponseCount,
  onClose,
  onFilterChange,
  onSearchQueryChange,
  responseCount,
  searchQuery,
}) => {
  const topBarCountLabel = `${filteredResponseCount}/${responseCount}件`;

  // ThreadPage本体は「どのバーを出すか」の判断だけに絞り、
  // バー自体の描画詳細は専用コンポーネントへ寄せて見通しを保つ。
  if (activeTopBar === "filter") {
    return (
      <div className="thread-page__top-bar thread-page__toolbar">
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
  }

  if (activeTopBar === "search") {
    return (
      <SearchBar
        className="thread-page__top-bar"
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        onClose={onClose}
        hitCount={filteredResponseCount}
      />
    );
  }

  return null;
};

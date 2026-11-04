import React, { useEffect, useMemo, useRef } from "react";
import { checkIcon, SearchOptionsMenu } from "src/view/browser/components/SearchOptionsMenu";
import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";
import type { ThreadFilter } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import type { SearchOptions } from "src/view/browser/utils/search-normalize";
import type { ThreadFilterCounts } from "src/view/browser/utils/thread-data-derived";

interface ThreadPageTopBarProps {
  activeTopBar: TopBarMode;
  filter: ThreadFilter;
  filterCounts: ThreadFilterCounts;
  onClose: () => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchOptionsChange: (options: SearchOptions) => void;
  searchFocusKey: number;
  suppressInitialFocus?: boolean;
  searchQuery: string;
  searchOptions: SearchOptions;
  /** 検索語の一部が読めないとき（不正な日付や正規表現）の理由。 */
  searchError?: string | null;
}

// 変更理由: 種類は1つだけ選ぶ形にして、選んでいる種類が「絞り込み」ボタンの表示になる。
const FILTER_ITEMS: { key: Exclude<ThreadFilter, "all">; label: string }[] = [
  { key: "popular", label: "人気" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "link", label: "外部リンク" },
  { key: "internalLink", label: "内部リンク" },
  { key: "own", label: "自分のレス" },
];

const DEFAULT_BUTTON_LABEL = "絞り込み";

// 変更理由: 構文を知らなくても使えるよう、入力欄の説明は欄の上へ重ねるだけにする。
const SEARCH_SYNTAX_HELP = [
  "文字を入れると本文を絞り込みます。",
  '空白: かつ / |: または / !: 除外 / "...": そのまま',
  "id: ID / name: 名前 / date: 日付（例 date:2026/10/01~2026/10/05）",
].join("\n");

export const ThreadPageTopBar: React.FC<ThreadPageTopBarProps> = ({
  activeTopBar,
  filter,
  filterCounts,
  onClose,
  onFilterChange,
  onSearchQueryChange,
  onSearchOptionsChange,
  searchFocusKey,
  suppressInitialFocus = false,
  searchQuery,
  searchOptions,
  searchError = null,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTopBar === "none" || suppressInitialFocus) {
      return;
    }

    // スクロール途中でツールバーを開いても input focus による scroll jump を起こしにくくする。
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
  }, [activeTopBar, searchFocusKey, suppressInitialFocus]);

  const filterItems = useMemo<ContextMenuItem[]>(
    () => [
      { id: "filter-heading", label: "種類", disabled: true },
      {
        id: "filter-all",
        label: "すべて",
        checked: filter === "all",
        icon: checkIcon(filter === "all"),
        onSelect: () => onFilterChange("all"),
      },
      ...FILTER_ITEMS.map(({ key, label }) => ({
        id: `filter-${key}`,
        label: `${label} (${filterCounts[key]})`,
        checked: filter === key,
        icon: checkIcon(filter === key),
        // 選んでいる種類をもう一度選ぶと解除する（従来の切り替えボタンと同じ）。
        onSelect: () => onFilterChange(filter === key ? "all" : key),
      })),
    ],
    [filter, filterCounts, onFilterChange],
  );

  // ThreadPage本体は「バーを出すか」だけを判断し、
  // 検索と絞り込みの複合UIは専用コンポーネントへ閉じ込めて見通しを保つ。
  if (activeTopBar === "none") {
    return null;
  }

  const selected = FILTER_ITEMS.find(({ key }) => key === filter);
  return (
    <div className="thread-page__top-bar thread-page__toolbar">
      <div className="thread-page__toolbar-search">
        <SearchOptionsMenu
          options={searchOptions}
          onChange={onSearchOptionsChange}
          leadingItems={filterItems}
          separateLeadingItems
          leadingItemsOnly
          label={selected?.label ?? DEFAULT_BUTTON_LABEL}
          active={filter !== "all"}
        />
        <input
          ref={inputRef}
          type="text"
          className="thread-page__toolbar-search-input"
          placeholder="フィルタする文字を入力"
          aria-label="フィルタする文字"
          aria-invalid={searchError ? true : undefined}
          title={searchError ?? SEARCH_SYNTAX_HELP}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") {
              return;
            }
            // 変更理由: 入力中のEscapeは文字だけを消し、空欄のときに限りバーを閉じる。
            // いきなり閉じると入力した絞り込み語まで失われるため、段階的に解除する。
            if (searchQuery !== "") {
              onSearchQueryChange("");
              return;
            }
            onClose();
          }}
        />
        <SearchOptionsMenu
          options={searchOptions}
          onChange={onSearchOptionsChange}
          separateLeadingItems
        />
      </div>
    </div>
  );
};

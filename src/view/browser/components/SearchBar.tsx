import React, { useEffect, useRef } from "react";
import { getSearchError, SearchOptionsMenu } from "src/view/browser/components/SearchOptionsMenu";
import { Spinner } from "src/view/browser/ui/Spinner";
import type { SearchOptions } from "src/view/browser/utils/search-normalize";

interface Props {
  className?: string;
  query: string;
  onQueryChange: (q: string) => void;
  /** 省略すると閉じるボタンと Escape での閉じる操作を出さない（常設のバー用）。 */
  onClose?: () => void;
  hitCount?: number;
  loading?: boolean;
  /** 検索バー先頭に差し込む補助コントロール（例: 検索モード切替）。 */
  prefix?: React.ReactNode;
  placeholder?: string;
  /** 表示時に入力欄へフォーカスするか。常設のバーでは奪わないよう false にする。 */
  autoFocus?: boolean;
  /** 渡すと右端に大文字小文字・かな・正規表現の切り替えを出す。`onSearchOptionsChange` と一緒に渡す。 */
  searchOptions?: SearchOptions;
  onSearchOptionsChange?: (options: SearchOptions) => void;
}

export const SearchBar: React.FC<Props> = ({
  className,
  query,
  onQueryChange,
  onClose,
  hitCount,
  loading = false,
  prefix,
  placeholder = "検索...",
  autoFocus = true,
  searchOptions,
  onSearchOptionsChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchError = searchOptions ? getSearchError(query, searchOptions) : null;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={["search-bar", className].filter(Boolean).join(" ")}>
      {prefix}
      <input
        ref={inputRef}
        type="text"
        className="search-bar__input"
        placeholder={placeholder}
        value={query}
        aria-invalid={searchError ? true : undefined}
        title={searchError ?? undefined}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose?.();
        }}
      />
      {searchOptions && onSearchOptionsChange ? (
        <SearchOptionsMenu options={searchOptions} onChange={onSearchOptionsChange} />
      ) : null}
      {loading ? (
        <Spinner size="xs" aria-label="検索中" />
      ) : hitCount !== undefined ? (
        <span className="search-bar__count">{hitCount}件</span>
      ) : null}
      {onClose ? (
        <button className="search-bar__close icon-button" onClick={onClose}>
          ✕
        </button>
      ) : null}
    </div>
  );
};

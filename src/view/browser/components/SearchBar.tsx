import React, { useEffect, useRef } from "react";
import { Spinner } from "src/view/browser/ui/Spinner";

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
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

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
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose?.();
        }}
      />
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

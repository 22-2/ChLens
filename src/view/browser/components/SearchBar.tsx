import React, { useEffect, useRef } from "react";

interface Props {
  className?: string;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  hitCount?: number;
  /** 検索バー先頭に差し込む補助コントロール（例: 検索モード切替）。 */
  prefix?: React.ReactNode;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({
  className,
  query,
  onQueryChange,
  onClose,
  hitCount,
  prefix,
  placeholder = "検索...",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
          if (e.key === "Escape") onClose();
        }}
      />
      {hitCount !== undefined && <span className="search-bar__count">{hitCount}件</span>}
      <button className="search-bar__close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
};

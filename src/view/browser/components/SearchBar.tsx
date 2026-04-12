import React, { useEffect, useRef } from "react";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  hitCount?: number;
}

export const SearchBar: React.FC<Props> = ({
  query,
  onQueryChange,
  onClose,
  hitCount,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        type="text"
        className="search-bar__input"
        placeholder="検索..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      {hitCount !== undefined && (
        <span className="search-bar__count">{hitCount}件</span>
      )}
      <button className="search-bar__close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
};

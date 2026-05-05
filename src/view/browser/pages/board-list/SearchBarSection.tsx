import { Box } from "@mantine/core";
import React from "react";
import { SearchBar } from "src/view/browser/components/SearchBar";

interface SearchBarSectionProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  hitCount: number;
}

/**
 * 検索バーセクション
 * 検索バーが有効な時にのみ表示される
 */
export const SearchBarSection: React.FC<SearchBarSectionProps> = ({
  isOpen,
  query,
  onQueryChange,
  onClose,
  hitCount,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <Box>
      <SearchBar
        query={query}
        onQueryChange={onQueryChange}
        onClose={onClose}
        hitCount={hitCount}
      />
    </Box>
  );
};

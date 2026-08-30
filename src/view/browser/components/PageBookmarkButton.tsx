import { Star } from "lucide-react";
import React from "react";
import { usePageBookmark } from "src/view/browser/hooks/use-page-bookmark";
import type { Page } from "src/view/browser/types";

interface PageBookmarkButtonProps {
  page: Page;
}

export const PageBookmarkButton: React.FC<PageBookmarkButtonProps> = ({ page }) => {
  const { bookmarkTarget, isBookmarked, isBookmarkPending, toggleBookmark } = usePageBookmark(page);
  const label = bookmarkTarget
    ? isBookmarked
      ? "お気に入りから削除"
      : "お気に入りに追加"
    : "お気に入りに追加できません";

  return (
    <button
      type="button"
      className={`tab-bar__bookmark${isBookmarked ? " tab-bar__bookmark--active" : ""}`}
      disabled={!bookmarkTarget || isBookmarkPending}
      title={label}
      aria-label={label}
      aria-pressed={bookmarkTarget ? isBookmarked : false}
      onClick={toggleBookmark}
    >
      <Star size={16} fill={isBookmarked ? "currentColor" : "none"} />
    </button>
  );
};

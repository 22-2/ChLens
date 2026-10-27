import React from "react";
import { findSearchMatchRanges } from "src/view/browser/utils/search-highlight";

interface Props {
  text: string;
  query: string;
}

/** スレ内フィルタと同じ一致範囲・スタイルで、一覧のテキスト検索を強調する。 */
export function SearchHighlight({ text, query }: Props): React.ReactElement | string {
  const ranges = findSearchMatchRanges(text, query.trim());
  if (ranges.length === 0) return text;

  const content: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) content.push(text.slice(cursor, range.start));
    content.push(
      <mark key={`${range.start}-${range.end}`} className="res__search-match">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) content.push(text.slice(cursor));
  return <>{content}</>;
}

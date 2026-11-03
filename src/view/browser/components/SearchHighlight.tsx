import React from "react";
import { findSearchMatchRanges } from "src/view/browser/utils/search-highlight";
import type { SearchOptions } from "src/view/browser/utils/search-normalize";

interface Props {
  text: string;
  query: string;
  /** 一覧の絞り込みと同じ条件にそろえる。省略すると従来どおりすべて区別しない。 */
  options?: SearchOptions;
}

/** スレ内フィルタと同じ一致範囲・スタイルで、一覧のテキスト検索を強調する。 */
export function SearchHighlight({ text, query, options }: Props): React.ReactElement | string {
  const ranges = findSearchMatchRanges(text, query.trim(), options);
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

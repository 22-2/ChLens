import type { IRes } from "src/service-container/interfaces";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { stripHtml } from "src/view/browser/utils/response-format";
import {
  compileSearch,
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";

// 変更理由: 検索対象ごとの判定をUIやデータ取得処理から分離し、対象の追加・変更時に
// 「すべて」が本文・名前・IDを含む契約を一つのテスト可能な処理で維持する。
// なぜ大文字小文字とカタカナ・ひらがなを同一視するか: 検索語の入力方式で結果が変わらないよう、
// 本文・名前・ID・検索語の全てを同じ正規化にかけてから比較する。
export function filterThreadResponses(
  responses: IRes[],
  query: string,
  searchTarget: ThreadSearchTarget,
  searchOptions: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): IRes[] {
  if (!query) {
    return responses;
  }

  // 正規表現が不正な間は絞り込まず、入力欄の表示で不正を伝える（打鍵の途中で全件が消えないように）。
  const { matcher } = compileSearch(query, searchOptions);
  if (!matcher) {
    return responses;
  }
  const includes = (text: string) => matcher.find(matcher.normalize(text)).length > 0;

  return responses.filter((res) => {
    switch (searchTarget) {
      case "all":
        return (
          includes(stripHtml(res.message)) ||
          includes(stripHtml(res.name)) ||
          includes(res.id ?? "")
        );
      case "body":
        return includes(stripHtml(res.message));
      case "name":
        return includes(stripHtml(res.name));
      case "id":
        return includes(res.id ?? "");
    }
  });
}

import type { IRes } from "src/service-container/interfaces";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { stripHtml } from "src/view/browser/utils/response-format";
import { normalizeSearchText } from "src/view/browser/utils/search-normalize";

// 変更理由: 検索対象ごとの判定をUIやデータ取得処理から分離し、対象の追加・変更時に
// 「すべて」が本文・名前・IDを含む契約を一つのテスト可能な処理で維持する。
// なぜ大文字小文字とカタカナ・ひらがなを同一視するか: 検索語の入力方式で結果が変わらないよう、
// 本文・名前・ID・検索語の全てを同じ正規化にかけてから比較する。
export function filterThreadResponses(
  responses: IRes[],
  query: string,
  searchTarget: ThreadSearchTarget,
): IRes[] {
  if (!query) {
    return responses;
  }

  const normalizedQuery = normalizeSearchText(query);

  return responses.filter((res) => {
    const text = normalizeSearchText(stripHtml(res.message));
    const name = normalizeSearchText(stripHtml(res.name));
    const id = normalizeSearchText(res.id ?? "");

    switch (searchTarget) {
      case "all":
        return (
          text.includes(normalizedQuery) ||
          name.includes(normalizedQuery) ||
          id.includes(normalizedQuery)
        );
      case "body":
        return text.includes(normalizedQuery);
      case "name":
        return name.includes(normalizedQuery);
      case "id":
        return id.includes(normalizedQuery);
    }
  });
}

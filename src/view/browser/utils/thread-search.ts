import type { IRes } from "src/service-container/interfaces";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { stripHtml } from "src/view/browser/utils/utils";

// 変更理由: 検索対象ごとの判定をUIやデータ取得処理から分離し、対象の追加・変更時に
// 「すべて」が本文・名前・IDを含む契約を一つのテスト可能な処理で維持する。
export function filterThreadResponses(
  responses: IRes[],
  query: string,
  searchTarget: ThreadSearchTarget,
): IRes[] {
  if (!query) {
    return responses;
  }

  const normalizedQuery = query.toLowerCase();

  return responses.filter((res) => {
    const text = stripHtml(res.message).toLowerCase();
    const name = stripHtml(res.name).toLowerCase();
    const id = res.id?.toLowerCase() ?? "";

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

import { useMemo } from "react";
import type { IRes } from "src/service-container/interfaces";
import type { ThreadFilter } from "src/view/browser/types";
import type { ThreadFilterCounts } from "src/view/browser/utils/thread-data-derived";

interface UseOwnResFilterParams {
  filter: ThreadFilter;
  ownResNums: ReadonlySet<number>;
  /** 絞り込み前の全レス。自分のレスの件数を数える。 */
  responses: readonly IRes[];
  /** 検索・他の種類で絞り込んだ後のレス。 */
  derivedResponses: IRes[];
  derivedCounts: ThreadFilterCounts;
}

/**
 * 「自分のレス」の絞り込みと件数を、他の絞り込みの結果へ足す。
 *
 * 変更理由: 自分のレスは書き込み履歴から決まり、その追跡はレス一覧の取得後でないと
 * 始められない。取得側（use-thread-data）の導出に含めると循環するため、追跡の後に足す。
 */
export function useOwnResFilter({
  filter,
  ownResNums,
  responses,
  derivedResponses,
  derivedCounts,
}: UseOwnResFilterParams): { filteredResponses: IRes[]; filterCounts: ThreadFilterCounts } {
  const filteredResponses = useMemo(
    () =>
      filter === "own"
        ? derivedResponses.filter((res) => ownResNums.has(res.num))
        : derivedResponses,
    [derivedResponses, filter, ownResNums],
  );
  const filterCounts = useMemo(
    () => ({
      ...derivedCounts,
      own: responses.filter((res) => ownResNums.has(res.num)).length,
    }),
    [derivedCounts, ownResNums, responses],
  );
  return { filteredResponses, filterCounts };
}

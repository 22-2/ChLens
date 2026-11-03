import { renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useOwnResFilter } from "src/view/browser/pages/thread/use-own-res-filter";
import type { ThreadFilterCounts } from "src/view/browser/utils/thread-data-derived";
import { describe, expect, it } from "vite-plus/test";

const response = (num: number): IRes => ({ num, name: "", mail: "", date: "", message: "" });
const responses = [response(1), response(2), response(3)];
const counts: ThreadFilterCounts = {
  popular: 0,
  image: 0,
  video: 0,
  link: 0,
  internalLink: 0,
  own: 0,
};

function run(filter: "all" | "own", derivedResponses: IRes[] = responses) {
  return renderHook(() =>
    useOwnResFilter({
      filter,
      ownResNums: new Set([2, 9]),
      responses,
      derivedResponses,
      derivedCounts: counts,
    }),
  ).result.current;
}

describe("useOwnResFilter", () => {
  it("自分のレスの種類を選ぶと、他の絞り込みの結果から自分のレスだけを残す", () => {
    expect(run("own").filteredResponses.map((res) => res.num)).toEqual([2]);
    expect(run("own", [response(1), response(3)]).filteredResponses).toEqual([]);
  });

  it("他の種類では絞り込み結果をそのまま返す", () => {
    expect(run("all").filteredResponses).toBe(responses);
  });

  it("自分のレスの件数は、レス一覧にあるものだけを数える", () => {
    expect(run("all").filterCounts.own).toBe(1);
  });
});

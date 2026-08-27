import type { IRes } from "src/service-container/interfaces";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

import { filterThreadResponses } from "src/view/browser/utils/thread-search";

function createRes(num: number, message: string, name: string, id: string): IRes {
  return {
    num,
    name,
    mail: "",
    date: "2026/08/27",
    id,
    message,
  };
}

const responses = [
  createRes(1, "本文に対象語", "名前1", "ID-1"),
  createRes(2, "本文2", "対象語の名前", "ID-2"),
  createRes(3, "本文3", "名前3", "対象語-ID"),
];

describe("filterThreadResponses", () => {
  const cases: { target: ThreadSearchTarget; expected: number[] }[] = [
    { target: "all", expected: [1, 2, 3] },
    { target: "body", expected: [1] },
    { target: "name", expected: [2] },
    { target: "id", expected: [3] },
  ];

  for (const { target, expected } of cases) {
    it(`${target} のみを検索対象にする`, () => {
      expect(filterThreadResponses(responses, "対象語", target).map((res) => res.num)).toEqual(
        expected,
      );
    });
  }

  it("空の検索語では元のレス一覧をそのまま返す", () => {
    expect(filterThreadResponses(responses, "", "name")).toBe(responses);
  });
});

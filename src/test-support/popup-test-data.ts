import { buildReplyIndexes } from "src/core/thread/reply-index";
import type { IRes } from "src/service-container/interfaces";

// 返信ツリーとプレビューのテストで共通に使う、レスと返信索引の固定データ。
// 複数のテストファイルが同じ本文から索引を作るため、ここで一度だけ定義する。
export function createRes(num: number, message: string, id?: string): IRes {
  return {
    num,
    name: `res-${num}`,
    mail: "",
    date: "2026/04/18(土) 12:00:00.000",
    message,
    id,
  };
}

// 本文から再構築するツリーとプレビューの返信件数が一致するよう、同じレスから索引を作る。
export const TEST_RES_MAP = new Map<number, IRes>([
  [1, createRes(1, "root response")],
  [2, createRes(2, "&gt;&gt;1<br>&gt;&gt;3")],
  [3, createRes(3, "preview target")],
  [4, createRes(4, "&gt;&gt;3<br>&gt;&gt;5")],
  [5, createRes(5, "nested preview target")],
]);

export const TEST_REP_INDEX = buildReplyIndexes(Array.from(TEST_RES_MAP.values())).repIndex;

export const DUPLICATE_REPLY_RES_MAP = new Map<number, IRes>([
  [3, createRes(3, "preview target")],
  [6, createRes(6, "&gt;&gt;3")],
]);

export const DUPLICATE_REPLY_INDEX = new Map<number, Set<number>>([[3, new Set([6])]]);

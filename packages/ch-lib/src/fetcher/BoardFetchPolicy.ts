import type { ChURL } from "../url/ChURL";

export interface BoardFetchInfo {
  path: string;
  charset: string;
}

/** 板URLからsubject.txt/offlaw取得先と文字コードを解決する。 */
export function getBoardFetchInfo(boardUrl: ChURL): BoardFetchInfo | null {
  // 変更理由: 取得先URLの組み立てはChURLにもあるため、掲示板ごとのURL規則を
  // 二重管理しない。ここではsubject取得に必要な文字コードだけ補う。
  const path = boardUrl.getSubjectUrl();
  if (!path) return null;

  return {
    path,
    charset: boardUrl.getTsld() === "shitaraba.net" ? "EUC-JP" : "Shift_JIS",
  };
}

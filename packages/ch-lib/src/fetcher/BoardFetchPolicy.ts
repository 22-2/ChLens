import type { ChURL } from "../url/ChURL";

export interface BoardFetchInfo {
  path: string;
  charset: string;
}

/** 板URLからsubject.txt/offlaw取得先と文字コードを解決する。 */
export function getBoardFetchInfo(boardUrl: ChURL): BoardFetchInfo | null {
  const match = new RegExp(`^/(\\w+)(?:/(\\d+)/|/?)$`).exec(boardUrl.url.pathname);
  if (!match) return null;

  const boardName = match[1];
  const categoryId = match[2];
  switch (boardUrl.getTsld()) {
    case "machi.to":
      return {
        path: `${boardUrl.url.origin}/bbs/offlaw.cgi/${boardName}/`,
        charset: "Shift_JIS",
      };
    case "shitaraba.net":
      return {
        path: `${boardUrl.url.protocol}//jbbs.shitaraba.net/${boardName}/${categoryId}/subject.txt`,
        charset: "EUC-JP",
      };
    default:
      return {
        path: `${boardUrl.url.origin}/${boardName}/subject.txt`,
        charset: "Shift_JIS",
      };
  }
}

import { ChURL } from "../url/ChURL";
import { decodeCharReference } from "../utils/entities";

export type BoardTitleSource = "setting" | "jbbs";
export type BoardTitleCharset = "shift_jis" | "euc-jp";

export interface BoardTitleRequest {
  url: string;
  charset: BoardTitleCharset;
  source: BoardTitleSource;
  fallbackTitle: string | null;
  boardTsld: string;
}

function getTwoChannelBoardKey(boardUrl: ChURL): string | null {
  const pathname = boardUrl.url.pathname.replace(/^\/+|\/+$/g, "");
  const normalizedMatch = /^test\/read\.cgi\/(\w+)/.exec(pathname);
  const boardKey = normalizedMatch?.[1] ?? pathname.split("/")[0];
  return boardKey || null;
}

function formatBoardTitle(title: string, boardTsld: string): string {
  switch (boardTsld) {
    case "5ch.io":
      return title.replace("＠2ch掲示板", "");
    case "2ch.sc":
      return `${title}_sc`;
    case "open2ch.net":
      return `${title}_op`;
    default:
      return title;
  }
}

/**
 * 板URLから板名取得に必要なリクエストだけを組み立てる。
 * 通信処理を受け持たないことで、ブラウザfetch・Tauri HTTP・fixtureのどれからでも利用できる。
 */
export function createBoardTitleRequest(urlStr: string): BoardTitleRequest | null {
  const boardUrl = new ChURL(urlStr).toBoard();

  if (boardUrl.bbsType === "jbbs") {
    const parts = boardUrl.url.pathname.split("/").filter(Boolean);
    const server = parts[0];
    const boardId = parts[1];
    if (!server || !boardId) return null;

    return {
      url: `${boardUrl.url.protocol}//jbbs.shitaraba.net/bbs/api/setting.cgi/${server}/${boardId}/`,
      charset: "euc-jp",
      source: "jbbs",
      fallbackTitle: null,
      boardTsld: boardUrl.getTsld(),
    };
  }

  if (boardUrl.bbsType !== "2ch") return null;

  const boardKey = getTwoChannelBoardKey(boardUrl);
  if (!boardKey) return null;

  return {
    url: `${boardUrl.url.origin}/${boardKey}/SETTING.TXT`,
    charset: "shift_jis",
    source: "setting",
    fallbackTitle: boardKey,
    boardTsld: boardUrl.getTsld(),
  };
}

/** 通信済みの設定本文から板名だけを解決する純粋な変換処理。 */
export function resolveBoardTitle(request: BoardTitleRequest, settingText: string): string | null {
  const rawTitle =
    request.source === "setting"
      ? (/^BBS_TITLE_ORIG=(.+)$/m.exec(settingText)?.[1]?.trim() ??
        /^BBS_TITLE=(.+)$/m.exec(settingText)?.[1]?.trim())
      : /^BBS_TITLE=(.+)$/m.exec(settingText)?.[1]?.trim();

  // 変更理由: SETTING.TXTにタイトルがない板でも、板キーを返して空のタブ名にしない。
  if (!rawTitle) return request.fallbackTitle;
  return formatBoardTitle(decodeCharReference(rawTitle), request.boardTsld);
}

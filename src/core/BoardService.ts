import {
  type BoardThread as CanonicalBoardThread,
  ChURL,
  HOSTNAME,
} from "packages/ch-lib/src/index";
import Board from "src/core/Board.js";
import { container } from "src/service-container/index";
import type { IBoardResult, IReadState, IThread } from "src/service-container/interfaces";

interface BoardGetResult {
  status: "success" | "error";
  message?: string | null;
  data: Array<CanonicalBoardThread & Partial<IThread>> | null;
}

interface BoardLikeUrl {
  href: string;
}

function getReadStateBoardUrl(boardUrl: string): string {
  const parsed = new ChURL(boardUrl);
  if (parsed.url.hostname !== HOSTNAME.EDDIBB) return boardUrl;

  const match = /^\/(?:test\/read\.cgi\/)?([\w-]+)\/?$/.exec(parsed.url.pathname);
  if (!match) return boardUrl;

  // 変更理由: エッヂの既読DBはスレURLから作った http の板URLをキーにする。
  // 一覧側の https URLで検索すると保存済みの既読情報を取得できない。
  const lookup = new URL(parsed.url.href);
  lookup.protocol = "http:";
  lookup.pathname = `/${match[1]}/`;
  return lookup.href;
}

function getReadStateThreadUrl(threadUrl: string): string {
  const parsed = new ChURL(threadUrl);
  // 変更理由: エッヂの一覧取得元は https を返す場合があるが、スレ閲覧と既読DBは
  // ChURL が正規化した http URL を使うため、一覧の照合キーも合わせる。
  return parsed.url.hostname === HOSTNAME.EDDIBB ? parsed.url.href : threadUrl;
}

const BoardService = {
  async getThreads(url: string | BoardLikeUrl): Promise<IBoardResult> {
    const urlStr = typeof url === "string" ? url : url.href;
    const result = (await Board.get(urlStr)) as BoardGetResult;
    const { status, message, data } = result;

    if (status === "error" && !data) {
      throw new Error(message || "板の取得に失敗しました");
    }

    const threads = data || [];

    const readStates = await container.readState.getByBoard(getReadStateBoardUrl(urlStr));
    const readStateMap = new Map<string, IReadState>();
    for (const rs of readStates) {
      readStateMap.set(getReadStateThreadUrl(rs.url), rs);
    }

    const processedThreads = threads.map((thread, index) => {
      const threadUrl = getReadStateThreadUrl(thread.url);
      let readState = readStateMap.get(threadUrl);
      const bookmark = container.bookmark.get(threadUrl);

      if (bookmark && bookmark.readState) {
        // 意図: readState は bookmark 側の方が新しい場合があるため、比較して新しい方を採用する。
        if (!readState || container.util.isNewerReadState(readState, bookmark.readState)) {
          readState = bookmark.readState;
        }
      }

      return {
        // BoardParser's canonical subject fields are projected into the legacy service item
        // explicitly; this keeps service-only state from leaking back into ch-lib.
        url: threadUrl,
        title: thread.title,
        resCount: thread.resCount,
        createdAt: thread.createdAt,
        ng: thread.ng,
        demoted: thread.demoted,
        highlight: thread.highlight,
        isNet: thread.isNet,
        readState,
        threadNumber: index,
      } as IThread;
    });

    return {
      threads: processedThreads,
      message: status === "error" ? (message ?? null) : null,
    };
  },

  async getCachedResCount(url: string, options?: { forceUpdate?: boolean }): Promise<unknown> {
    return Board.getCachedResCount(url, options);
  },
};

export default BoardService;

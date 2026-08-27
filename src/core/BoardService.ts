import type { BoardThread as CanonicalBoardThread } from "packages/ch-lib/src/index";
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

const BoardService = {
  async getThreads(url: string | BoardLikeUrl): Promise<IBoardResult> {
    const urlStr = typeof url === "string" ? url : url.href;
    const result = (await Board.get(urlStr)) as BoardGetResult;
    const { status, message, data } = result;

    if (status === "error" && !data) {
      throw new Error(message || "板の取得に失敗しました");
    }

    const threads = data || [];

    const readStates = await container.readState.getByBoard(urlStr);
    const readStateMap = new Map<string, IReadState>();
    for (const rs of readStates) {
      readStateMap.set(rs.url, rs);
    }

    const processedThreads = threads.map((thread, index) => {
      let readState = readStateMap.get(thread.url);
      const bookmark = container.bookmark.get(thread.url);

      if (bookmark && bookmark.readState) {
        // 意図: readState は bookmark 側の方が新しい場合があるため、比較して新しい方を採用する。
        if (!readState || container.util.isNewerReadState(readState, bookmark.readState)) {
          readState = bookmark.readState;
        }
      }

      return {
        // BoardParser's canonical subject fields are projected into the legacy service item
        // explicitly; this keeps service-only state from leaking back into ch-lib.
        url: thread.url,
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

  async getCachedResCount(url: string): Promise<unknown> {
    return Board.getCachedResCount(url);
  },
};

export default BoardService;

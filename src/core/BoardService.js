import { container } from "../service-container/index";
import Board from "./Board.js";

/**
 * Service for board-related operations.
 * Extracts business logic from views.
 */
const BoardService = {
  /**
   * Fetches threads for a given board URL and merges them with read states and bookmarks.
   * @param {app.URL.URL} url
   * @returns {Promise<import("../service-container/interfaces").IBoardResult>}
   */
  async getThreads(url) {
    const urlStr = typeof url === "string" ? url : url.href;
    const { status, message, data } = await Board.get(url);
    
    if (status === "error" && !data) {
      throw new Error(message || "板の取得に失敗しました");
    }

    // data may exist even if status is error (e.g. cache was used)
    const threads = data || [];

    const readStates = await container.readState.getByBoard(urlStr);
    const readStateMap = new Map();
    for (const rs of readStates) {
      readStateMap.set(rs.url, rs);
    }

    const processedThreads = threads.map((/** @type {any} */ thread, /** @type {number} */ index) => {
      let readState = readStateMap.get(thread.url);
      const bookmark = container.bookmark.get(thread.url);
      
      if (bookmark && bookmark.readState) {
        if (!readState || container.util.isNewerReadState(readState, bookmark.readState)) {
          readState = bookmark.readState;
        }
      }

      return {
        ...thread,
        readState,
        threadNumber: index
      };
    });

    return {
      threads: processedThreads,
      message: status === "error" ? message : null
    };
  }
};

export default BoardService;

import { container } from "src/service-container/index";
import Thread from "src/core/Thread.js";
import { buildReplyIndexes } from "src/core/reply-index";
import { toCanonicalThread } from "src/core/thread-model-adapter.js";

/**
 * @typedef {import("../service-container/interfaces").IThreadService} IThreadService
 * @typedef {import("../service-container/interfaces").IThreadDetail} IThreadDetail
 * @typedef {import("../service-container/interfaces").IRes} IRes
 */

class ThreadServiceImpl {
  /**
   * Fetches a thread and its responses.
   * @param {string} url
   * @param {{ forceUpdate?: boolean, onCache?: (thread: IThreadDetail) => void }} [options]
   * @returns {Promise<IThreadDetail>}
   */
  async getThread(url, options = {}) {
    const thread = new Thread(url);

    const progress = () => {
      if (options.onCache) {
        options.onCache(this._formatResult(thread));
      }
    };

    try {
      await thread.get(options.forceUpdate, progress);
      return this._formatResult(thread);
    } catch (error) {
      // 変更理由: 取得失敗時もキャッシュ結果を返す従来動作を保ちつつ、原因を追跡可能にする。
      console.error("[ThreadService] thread fetch failed:", error);
      const result = this._formatResult(thread);
      result.message = thread.message || "スレッドの取得に失敗しました";
      return result;
    }
  }

  /**
   * Formats a Thread instance into a structured IThreadDetail.
   * @private
   * @param {any} thread
   * @returns {IThreadDetail}
   */
  _formatResult(thread) {
    // Thread keeps the legacy `res` cache shape because its HTML delta merge relies on it;
    // normalize once here so NG and every service consumer receive the shared ch-lib model.
    const canonicalThread = toCanonicalThread({
      title: thread.title || undefined,
      res: thread.res || [],
    });
    const parsedResponses = canonicalThread.posts.map((r) => this._parseRes(r));
    const replyIndexes = buildReplyIndexes(parsedResponses);
    const title = thread.title || "";
    const url = thread.url.url.href;

    return {
      url,
      title: thread.title,
      // 返信数を全レスから先に索引化してからNG判定する。
      // レス単位のパース中に判定すると、後続レスの安価を数えられず、
      // 自動更新で閾値を超えたレスだけNGにならないため。
      res: parsedResponses.map((/** @type {IRes} */ res) => ({
        ...res,
        ng:
          container.ng.isNGThread(
            {
              ...res,
              replyCount: replyIndexes.repIndex.get(res.num)?.size ?? 0,
              anchorCount: replyIndexes.ancIndex.get(res.num)?.size ?? 0,
            },
            title,
            url,
          ) || undefined,
      })),
      expired: !!thread.expired,
      missingFromSubject: !!thread.missingFromSubject,
    };
  }

  /**
   * Parses raw response data into structured IRes.
   * @private
   * @param {any} rawRes
   * @returns {IRes}
   */
  _parseRes(rawRes) {
    /** @type {IRes} */
    const res = {
      num: rawRes.number,
      name: rawRes.name,
      mail: rawRes.mail,
      message: rawRes.message,
      other: rawRes.other ?? rawRes.date,
      date: "",
    };

    // MetadataParser has already extracted these fields at the canonical adapter boundary.
    res.id = rawRes.id;
    res.slip = rawRes.slip;
    res.trip = rawRes.trip;
    res.be = rawRes.be;

    // Extract Date and ID from other
    const other = res.other;
    if (other) {
      // Date extraction
      const dateMatch = /\d{4}\/\d{1,2}\/\d{1,2}\(.\)\s\d{1,2}:\d\d(?::\d\d(?:\.\d+)?)?/.exec(
        other,
      );
      if (dateMatch) {
        res.date = dateMatch[0];
      }

      if (res.id == null) {
        // ID extraction
        const idMatch = /(?:^| |(\d))(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/.exec(other);
        if (idMatch) {
          let fixedId = idMatch[2];
          if (fixedId.endsWith("\u25cf")) {
            fixedId = fixedId.slice(0, -1);
          }
          // Extract the ID value without the "ID:" or "発信元:" prefix
          // Reason: The id field should store only the identifier value (e.g., "TestImage5"),
          // not the prefix, so that UI/indexing can work without assuming prefix format
          if (fixedId.startsWith("ID:")) {
            fixedId = fixedId.slice(3);
          } else if (fixedId.startsWith("発信元:")) {
            fixedId = fixedId.slice(4);
          }
          // HTML形式ではdata-useridを優先して既にres.idへ渡しているため、
          // 表示用メタデータのuidで上書きせず、dat形式だけをここで補完する。
          res.id = fixedId;
        }
      }

      // BE extraction
      const beMatch = /BE:(\d+)-[A-Z\d]+\(\d+\)/.exec(other);
      if (beMatch) {
        res.be = beMatch[0];
      }
    }
    return res;
  }
}

/** @type {IThreadService} */
export default new ThreadServiceImpl();

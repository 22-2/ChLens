import { container } from "../service-container/index";
import Thread from "./Thread.js";

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
    } catch (e) {
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
    return {
      url: thread.url.url.href,
      title: thread.title,
      res: (thread.res || []).map(
        (/** @type {any} */ r, /** @type {number} */ i) =>
          this._parseRes(r, i + 1, thread.title, thread.url.url.href),
      ),
      expired: !!thread.expired,
    };
  }

  /**
   * Parses raw response data into structured IRes.
   * @private
   * @param {any} rawRes
   * @param {number} num
   * @param {string} title
   * @param {string} url
   * @returns {IRes}
   */
  _parseRes(rawRes, num, title, url) {
    /** @type {IRes} */
    const res = {
      ...rawRes,
      num,
      name: rawRes.name,
      mail: rawRes.mail,
      message: rawRes.message,
      date: "",
    };

    // Extract Slip and Trip from name (similar logic to ThreadContent.js)
    const name = rawRes.name;
    if (name) {
      const slipMatch = /<\/b>\(([^<>]+? [^<>]+?)\)<b>$/.exec(name);
      if (slipMatch) {
        res.slip = slipMatch[1];
      }
      const tripMatch = /<\/b> ?(◆[^<>]+?) ?<b>/.exec(name);
      if (tripMatch) {
        res.trip = tripMatch[1];
      }
    }

    // Extract Date and ID from other
    const other = rawRes.other;
    if (other) {
      // Date extraction
      const dateMatch =
        /\d{4}\/\d{1,2}\/\d{1,2}\(.\)\s\d{1,2}:\d\d(?::\d\d(?:\.\d+)?)?/.exec(
          other,
        );
      if (dateMatch) {
        res.date = dateMatch[0];
      }

      // ID extraction
      const idMatch =
        /(?:^| |(\d))(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/.exec(
          other,
        );
      if (idMatch) {
        let fixedId = idMatch[2];
        if (fixedId.endsWith("\u25cf")) {
          fixedId = fixedId.slice(0, -1);
        }
        res.id = fixedId;
      }

      // BE extraction
      const beMatch = /BE:(\d+)\-[A-Z\d]+\(\d+\)/.exec(other);
      if (beMatch) {
        res.be = beMatch[0];
      }
    }
    // NG Check
    res.ng = container.ng.isNGThread(res, title, url) || undefined;

    return res;
  }
}

/** @type {IThreadService} */
export default new ThreadServiceImpl();

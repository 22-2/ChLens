import { extractPostDate } from "packages/ch-lib/src/index";
import { buildReplyIndexes } from "src/core/reply-index";
import Thread from "src/core/Thread.js";
import { toCanonicalThread } from "src/core/thread-model-adapter.js";
import { container } from "src/service-container/index";

/**
 * @typedef {import("../service-container/interfaces").IThreadService} IThreadService
 * @typedef {import("../service-container/interfaces").IThreadDetail} IThreadDetail
 * @typedef {import("../service-container/interfaces").IRes} IRes
 */

class ThreadServiceImpl {
  constructor() {
    /** @type {Map<string, {
     *   started: boolean,
     *   forceUpdate: boolean,
     *   callbacks: Set<(thread: IThreadDetail) => void>,
     *   lastCacheResult?: IThreadDetail,
     *   promise: Promise<IThreadDetail>
     * }>} */
    this.pendingRequests = new Map();
  }

  /**
   * Fetches a thread and its responses.
   * @param {string} url
   * @param {{ forceUpdate?: boolean, onCache?: (thread: IThreadDetail) => void }} [options]
   * @returns {Promise<IThreadDetail>}
   */
  async getThread(url, options = {}) {
    const existingRequest = this.pendingRequests.get(url);
    if (
      existingRequest &&
      (!options.forceUpdate || existingRequest.forceUpdate || !existingRequest.started)
    ) {
      // 変更理由: スレ本文と勢い表示は同じ更新世代で同一URLを要求するため、
      // 通信開始前なら強いforceUpdateへまとめ、開始後も条件を弱めない要求だけを共有する。
      existingRequest.forceUpdate ||= options.forceUpdate === true;
      if (options.onCache) {
        existingRequest.callbacks.add(options.onCache);
        if (existingRequest.lastCacheResult) {
          try {
            options.onCache(existingRequest.lastCacheResult);
          } catch (error) {
            // 遅れて合流した表示先の例外でも、共有中の取得結果は他の利用者へ返し続ける。
            console.error("[ThreadService] キャッシュ通知に失敗しました:", error);
          }
        }
      }
      return existingRequest.promise;
    }

    /** @type {{
     *   started: boolean,
     *   forceUpdate: boolean,
     *   callbacks: Set<(thread: IThreadDetail) => void>,
     *   lastCacheResult?: IThreadDetail,
     *   promise: Promise<IThreadDetail>
     * }} */
    const request = {
      started: false,
      forceUpdate: options.forceUpdate === true,
      callbacks: new Set(options.onCache ? [options.onCache] : []),
      promise: /** @type {Promise<IThreadDetail>} */ (null),
    };

    // 同じReact effect処理内の要求をmicrotaskまで集め、後から来たforceUpdateも
    // 最初の通信へ反映して、呼び出し順により二重取得へ戻らないようにする。
    request.promise = Promise.resolve()
      .then(async () => {
        request.started = true;
        return await this._fetchThread(url, request);
      })
      .finally(() => {
        // 開始済みの通常取得と後発の強制取得が並行した場合、後発の管理情報を消さない。
        if (this.pendingRequests.get(url) === request) {
          this.pendingRequests.delete(url);
        }
      });
    this.pendingRequests.set(url, request);
    return request.promise;
  }

  /**
   * @private
   * @param {string} url
   * @param {{
   *   forceUpdate: boolean,
   *   callbacks: Set<(thread: IThreadDetail) => void>,
   *   lastCacheResult?: IThreadDetail
   * }} request
   * @returns {Promise<IThreadDetail>}
   */
  async _fetchThread(url, request) {
    const thread = new Thread(url);

    const progress = () => {
      const result = this._formatResult(thread);
      request.lastCacheResult = result;
      for (const callback of request.callbacks) {
        try {
          callback(result);
        } catch (error) {
          // 一つの表示先の例外で他の購読先やスレ取得自体を止めない。
          console.error("[ThreadService] キャッシュ通知に失敗しました:", error);
        }
      }
    };

    try {
      await thread.get(request.forceUpdate, progress);
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
      // 日時の形式差はch-libへ集約し、ここでは表示用フィールドへ変換結果を渡す。
      res.date = extractPostDate(other) ?? "";

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

import { toCanonicalThread } from "packages/ch-lib/src/index";
import { replace as replaceStrTxt } from "src/core/ReplaceStrTxt.js";
import Thread from "src/core/Thread.js";
import { evaluateThreadNg } from "src/core/ThreadNgEvaluator";
import { toViewRes } from "src/core/to-view-res";

/**
 * @typedef {import("../service-container/interfaces").IThreadService} IThreadService
 * @typedef {import("../service-container/interfaces").IThreadDetail} IThreadDetail
 * @typedef {import("../service-container/interfaces").IRes} IRes
 */

/**
 * 自動更新ではない強制取得か。
 * @param {{ forceUpdate?: boolean, throttleSubjectCheck?: boolean }} options
 * @returns {boolean}
 */
const isManualForceUpdate = (options) =>
  options.forceUpdate === true && options.throttleSubjectCheck !== true;

class ThreadServiceImpl {
  constructor() {
    /** @type {Map<string, {
     *   started: boolean,
     *   forceUpdate: boolean,
     *   manualForceUpdate: boolean,
     *   callbacks: Set<(thread: IThreadDetail) => void>,
     *   lastCacheResult?: IThreadDetail,
     *   promise: Promise<IThreadDetail>
     * }>} */
    this.pendingRequests = new Map();
  }

  /**
   * Fetches a thread and its responses.
   * @param {string} url
   * @param {{ forceUpdate?: boolean, throttleSubjectCheck?: boolean, onCache?: (thread: IThreadDetail) => void }} [options]
   * @returns {Promise<IThreadDetail>}
   */
  async getThread(url, options = {}) {
    const existingRequest = this.pendingRequests.get(url);
    if (
      existingRequest &&
      (!existingRequest.started ||
        !options.forceUpdate ||
        (existingRequest.forceUpdate &&
          // 開始済みの自動更新へ手動更新を合流させると、subject.txtを確認できない。
          (existingRequest.manualForceUpdate || !isManualForceUpdate(options))))
    ) {
      // 変更理由: スレ本文と勢い表示は同じ更新世代で同一URLを要求するため、
      // 通信開始前なら強いforceUpdateへまとめ、開始後も条件を弱めない要求だけを共有する。
      existingRequest.forceUpdate ||= options.forceUpdate === true;
      // 自動更新と手動更新が合流した場合は、利用者の操作を優先してsubject.txtを確認する。
      existingRequest.manualForceUpdate ||= isManualForceUpdate(options);
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
     *   manualForceUpdate: boolean,
     *   callbacks: Set<(thread: IThreadDetail) => void>,
     *   lastCacheResult?: IThreadDetail,
     *   promise: Promise<IThreadDetail>
     * }} */
    const request = {
      started: false,
      forceUpdate: options.forceUpdate === true,
      manualForceUpdate: isManualForceUpdate(options),
      callbacks: new Set(options.onCache ? [options.onCache] : []),
      // 同じReact effect処理内の要求をmicrotaskまで集め、後から来たforceUpdateも
      // 最初の通信へ反映して、呼び出し順により二重取得へ戻らないようにする。
      // 変更理由: nullを一時値としてPromise型へキャストすると、型契約と実値が矛盾する。
      // Promiseのコールバックはmicrotaskで実行されるため、生成時から完全なPromiseを保持できる。
      promise: Promise.resolve()
        .then(async () => {
          request.started = true;
          return await this._fetchThread(url, request);
        })
        .finally(() => {
          // 開始済みの通常取得と後発の強制取得が並行した場合、後発の管理情報を消さない。
          if (this.pendingRequests.get(url) === request) {
            this.pendingRequests.delete(url);
          }
        }),
    };
    this.pendingRequests.set(url, request);
    return request.promise;
  }

  /**
   * @private
   * @param {string} url
   * @param {{
   *   forceUpdate: boolean,
   *   manualForceUpdate: boolean,
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
      await thread.get(request.forceUpdate, progress, {
        throttleSubjectCheck: !request.manualForceUpdate,
      });
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
    const title = thread.title || "";
    const url = thread.url.url.href;
    // 置換ルールは名前・日付からのID/Slip抽出より前に適用する（旧ThreadModelと同じ順序）。
    // 変更理由: 旧経路の置換適用がThreadModelと共に使われなくなり、置換設定が無効化されていたため。
    const replacedRes = (thread.res || []).map((/** @type {any} */ res) => ({
      ...res,
      ...replaceStrTxt(url, title, res),
    }));
    const canonicalThread = toCanonicalThread({
      title: thread.title || undefined,
      res: replacedRes,
    });
    const parsedResponses = canonicalThread.posts.map(toViewRes);
    // 自動NG（連鎖・ID無し等）を含むNG判定は、全レスを見渡せるこの時点で一括して行う。
    const ngResults = evaluateThreadNg(parsedResponses, { title, url });

    return {
      url,
      title: thread.title,
      // 返信数や連鎖NGは後続レスにも依存するため、全レスの索引を作ってから判定済みの結果を載せる。
      res: parsedResponses.map((/** @type {IRes} */ res) => ({
        ...res,
        ng: ngResults.get(res.num),
      })),
      expired: !!thread.expired,
      missingFromSubject: !!thread.missingFromSubject,
    };
  }
}

/** @type {IThreadService} */
export default new ThreadServiceImpl();

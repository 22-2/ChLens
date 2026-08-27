import { ChURL } from "packages/ch-lib/src/index";
import { platform } from "src/app";
import type { HttpResponse } from "src/app/platform/types";
import type Cache from "src/core/Cache.js";
import { chServerMoveDetect } from "src/core/jsutil.js";
import {
  buildConditionalRequestHeaders,
  buildThreadFetchPlan,
  isMissingFromSubject,
} from "src/core/ThreadGetHelpers";
import {
  getThreadXhrInfo,
  isHtmlThread,
  parseChThread,
  parseJbbsArchiveThread,
  parseJbbsThread,
  parseMachiThread,
  parseNetThread,
  parsePinkThread,
  parseThread,
  type ParsedThread,
  type ThreadRes,
  type XhrInfo,
} from "src/core/ThreadParser.js";
import { container } from "src/service-container/index";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CachedResCount {
  resCount: number;
}

interface CachedInfoResult {
  status: string;
  cachedInfo?: CachedResCount;
}

interface ThreadFailure {
  response?: HttpResponse;
  thread?: ParsedThread;
}

/** _prepareCache の戻り値 */
interface PrepareResult {
  hasCache: boolean;
  needFetch: boolean;
}

/** _doFetch の戻り値 */
interface FetchResult {
  response: HttpResponse;
  xhrPath: string;
  deltaFlg: boolean;
  readcgiVer: number;
}

/** _parseResponseIntoThread / _parseSuccessResponse の戻り値 */
interface ParseResult {
  thread: ParsedThread | undefined;
  noChangeFlg: boolean;
}

/** _updateCacheAfterFetch に渡すパラメータ */
interface UpdateCacheParams {
  cache: Cache;
  response: HttpResponse | undefined;
  thread: ParsedThread;
  deltaFlg: boolean;
  isHtml: boolean;
  readcgiVer: number;
  noChangeFlg: boolean;
  hasCache: boolean;
}

// ---------------------------------------------------------------------------
// Thread class
// ---------------------------------------------------------------------------

/**
 * @class Thread
 * @constructor
 * @param {String} url
 *
 * 設計方針:
 *   - get() はオーケストレーションのみ担当し、具体的な処理は private メソッドへ委譲する。
 *   - 通信・キャッシュ・パース・エラーメッセージ生成の責務をそれぞれ分離し、
 *     単体テストを書きやすくする。
 */
export default class Thread {
  url: ChURL;
  title: string | null;
  res: ThreadRes[] | null;
  message: string | null;
  tsld: string;
  expired: boolean;
  missingFromSubject: boolean;

  constructor(url: string | ChURL) {
    this.url = url instanceof ChURL ? url : new ChURL(url);
    this.title = null;
    this.res = null;
    this.message = null;
    this.tsld = this.url.getTsld();
    this.expired = false;
    this.missingFromSubject = false;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async get(forceUpdate?: boolean, progress: () => void = () => {}): Promise<void> {
    const format2chnet = container.config.get("format_2chnet") as string | null | undefined;
    const xhrInfo = getThreadXhrInfo(this.url, format2chnet);

    if (!xhrInfo) {
      this.message = "対応していないURLです";
      return Promise.reject();
    }

    const { path: xhrBasePath, charset: xhrCharset } = xhrInfo;
    const isHtml = isHtmlThread(this.url, format2chnet);
    const cache = container.cache.getCache(xhrBasePath) as Cache;

    // 板スレ一覧のキャッシュ取得はフェッチと並行して開始する
    const getCachedInfoPromise = this._fetchCachedResCount();

    const { hasCache, needFetch } = await this._prepareCache(
      cache,
      format2chnet,
      forceUpdate,
      progress,
    );

    let response: HttpResponse | undefined;
    let thread: ParsedThread | undefined;
    let deltaFlg = false;
    let readcgiVer = 5;
    let noChangeFlg: boolean;
    let failed = false;

    try {
      // --- フェッチ ---
      if (needFetch) {
        const fetched = await this._doFetch({
          cache,
          hasCache,
          isHtml,
          xhrBasePath,
          xhrCharset,
        });
        response = fetched.response;
        deltaFlg = fetched.deltaFlg;
        readcgiVer = fetched.readcgiVer;
      }

      // --- レスポンス解析 ---
      ({ thread, noChangeFlg } = this._parseResponseIntoThread({
        response,
        cache,
        hasCache,
        deltaFlg,
        isHtml,
        readcgiVer,
        bbsType: this.url.bbsType,
        format2chnet,
      }));

      if (!thread) {
        throw { response };
      }
      if (this.url.bbsType === "2ch" && response?.status === 203) {
        throw { response, thread };
      }
      if (
        response?.status !== 200 &&
        response?.status !== 304 &&
        (!(readcgiVer >= 6) || response?.status !== 500) &&
        (!!response || !hasCache)
      ) {
        throw { response, thread };
      }

      // --- あぼーん補填・インスタンスへの反映 ---
      const cachedInfoResult = await getCachedInfoPromise;
      this._padAbobunIfNeeded(thread, cachedInfoResult);
      this._applyThreadToSelf(thread);
      this.message = "";

      // キャッシュ更新はメインフローをブロックしない（fire-and-forget）
      void this._updateCacheAfterFetch({
        cache,
        response,
        thread,
        deltaFlg,
        isHtml,
        readcgiVer,
        noChangeFlg,
        hasCache,
      }).catch(() => {});
    } catch (error: unknown) {
      const failure = typeof error === "object" && error != null ? (error as ThreadFailure) : {};
      response = failure.response;
      thread = failure.thread;

      if (thread) {
        this.title = thread.title ?? null;
        this.res = thread.res;
      }
      this.message = await this._buildDomainErrorMessage({
        response,
        hasCache,
        thread,
      });
      // 変更理由: _buildDomainErrorMessage 内で thread.expired = true が設定される場合
      // （5ch.io の 203 など）があるため、インスタンス側にも伝播させる。
      // また、HTTP 203 はサーバーが明示的に dat 落ちを通知するステータスなので、
      // thread の有無にかかわらず expired とする。
      if (thread?.expired === true || response?.status === 203) {
        this.expired = true;
      }
      failed = true;
    } finally {
      // ブックマーク更新は成否に関わらず実行する
      if (thread != null) {
        container.bookmark.updateResCount(this.url.url.href, thread.res.length);
      }
      // サーバーシグナル(203) に加え、スレ一覧不在による dat 落ち判定でも expired 更新を行う
      if (response?.status === 203 || this.expired) {
        container.bookmark.updateExpired(this.url.url.href, true);
      }
    }

    if (failed) {
      return Promise.reject();
    }
  }

  // -------------------------------------------------------------------------
  // Private: キャッシュ・フェッチ
  // -------------------------------------------------------------------------

  /**
   * 板スレ一覧からキャッシュされたレス数を取得する。
   * get() の最初に呼び出してフェッチと並行して実行する。
   */
  private async _fetchCachedResCount(): Promise<CachedInfoResult> {
    try {
      // getCachedResCount は文字列URLを受け取る契約。ChURL は toString() を持たないため、
      // インスタンスをそのまま渡すと "[object Object]" が URL として解釈され常に失敗していた。
      const cachedInfo = (await container.board.getCachedResCount(
        this.url.url.href,
      )) as CachedResCount;
      return { status: "success", cachedInfo };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "板のスレ一覧にそのスレが存在しません") {
        return { status: "not_found" };
      }
      return { status: "none" };
    }
  }

  /**
   * キャッシュを読み込み、必要に応じてプログレスコールバックで中間表示する。
   *
   * - キャッシュが存在し有効期限内 → needFetch = false（通信スキップ）
   * - キャッシュが存在するが期限切れ → まず現キャッシュを表示してから needFetch = true
   * - キャッシュなし → hasCache = false, needFetch = true
   */
  private async _prepareCache(
    cache: Cache,
    format2chnet: string | null | undefined,
    forceUpdate: boolean | undefined,
    progress: () => void,
  ): Promise<PrepareResult> {
    try {
      await cache.get();
      const isFresh = !forceUpdate && Date.now() - (cache.lastUpdated ?? 0) <= 1000 * 3;
      if (isFresh) {
        return { hasCache: true, needFetch: false };
      }
      // キャッシュはあるが期限切れ: 現在のキャッシュをまず表示する
      await container.util.defer();
      const tmp =
        cache.parsed != null
          ? (cache.parsed as ParsedThread)
          : parseThread(this.url, cache.data ?? "", { format2chnet });
      if (tmp != null) {
        this.res = tmp.res;
        this.title = tmp.title ?? null;
        progress();
      }
      return { hasCache: true, needFetch: true };
    } catch {
      return { hasCache: false, needFetch: true };
    }
  }

  /**
   * フェッチ計画を組み立てて HTTP リクエストを実行する。
   * URL の決定・差分フラグ・readcgi バージョン・条件付きヘッダーの生成を担う。
   */
  private async _doFetch({
    cache,
    hasCache,
    isHtml,
    xhrBasePath,
    xhrCharset,
  }: {
    cache: Cache;
    hasCache: boolean;
    isHtml: boolean;
    xhrBasePath: string;
    xhrCharset: string;
  }): Promise<FetchResult> {
    const plan = buildThreadFetchPlan({
      tsld: this.tsld,
      isArchive: this.url.isArchive,
      isHtml,
      hasCache,
      basePath: xhrBasePath,
      cacheResLength: cache.resLength,
      cacheReadcgiVer: cache.readcgiVer,
    });

    const headers = buildConditionalRequestHeaders({
      hasCache,
      lastModified: cache.lastModified,
      etag: cache.etag,
    });

    const response = await platform.http.fetch(plan.xhrPath, {
      method: "GET",
      mimeType: `text/plain; charset=${xhrCharset}`,
      headers,
    });

    return {
      response,
      xhrPath: plan.xhrPath,
      deltaFlg: plan.deltaFlg,
      readcgiVer: plan.readcgiVer,
    };
  }

  // -------------------------------------------------------------------------
  // Private: レスポンス解析
  // -------------------------------------------------------------------------

  /**
   * HTTP レスポンスのステータスと各種フラグに基づいてスレッドを組み立てる。
   * ステータスコードによる分岐のエントリポイント。
   */
  private _parseResponseIntoThread({
    response,
    cache,
    hasCache,
    deltaFlg,
    isHtml,
    readcgiVer,
    bbsType,
    format2chnet,
  }: {
    response: HttpResponse | undefined;
    cache: Cache;
    hasCache: boolean;
    deltaFlg: boolean;
    isHtml: boolean;
    readcgiVer: number;
    bbsType: string;
    format2chnet: string | null | undefined;
  }): ParseResult {
    if (response?.status === 200 || (readcgiVer >= 6 && response?.status === 500)) {
      return this._parseSuccessResponse({
        response,
        cache,
        deltaFlg,
        isHtml,
        readcgiVer,
        format2chnet,
      });
    }

    if (bbsType === "2ch" && response?.status === 203) {
      return {
        thread: this._parse203Response({
          response,
          cache,
          hasCache,
          deltaFlg,
          isHtml,
          format2chnet,
        }),
        noChangeFlg: false,
      };
    }

    if (hasCache) {
      const thread = isHtml
        ? (cache.parsed as ParsedThread)
        : (parseThread(this.url, cache.data ?? "", { format2chnet }) ?? undefined);
      return { thread, noChangeFlg: false };
    }

    return { thread: undefined, noChangeFlg: false };
  }

  /**
   * status 200 および readcgiVer >= 6 & status 500（変化なし相当）のレスポンスを解析する。
   * delta 取得・HTML 形式・readcgi バージョンによる合成処理を担う。
   */
  private _parseSuccessResponse({
    response,
    cache,
    deltaFlg,
    isHtml,
    readcgiVer,
    format2chnet,
  }: {
    response: HttpResponse;
    cache: Cache;
    deltaFlg: boolean;
    isHtml: boolean;
    readcgiVer: number;
    format2chnet: string | null | undefined;
  }): ParseResult {
    // 全取得
    if (!deltaFlg) {
      return {
        thread: parseThread(this.url, response.body, { format2chnet }) ?? undefined,
        noChangeFlg: false,
      };
    }

    // 差分取得・dat 形式
    if (!isHtml) {
      return {
        thread:
          parseThread(this.url, (cache.data ?? "") + response.body, {
            format2chnet,
          }) ?? undefined,
        noChangeFlg: false,
      };
    }

    // 差分取得・HTML 形式
    const threadCache = cache.parsed as ParsedThread;

    // readcgiVer >= 6 の "変化なし" レスポンス
    if (readcgiVer >= 6 && response.status === 500) {
      return { thread: threadCache, noChangeFlg: true };
    }

    const threadResponse = parseThread(this.url, response.body, {
      format2chnet,
      resLength: +(cache.resLength || 0),
    });

    if (!threadResponse) {
      return { thread: undefined, noChangeFlg: false };
    }

    // readcgiVer < 6 で差分が 1 件（＝変化なし）
    if (readcgiVer < 6 && threadResponse.res.length === 1) {
      return { thread: threadCache, noChangeFlg: true };
    }

    if (readcgiVer < 6) {
      threadResponse.res.shift(); // 先頭の重複レスを除去
    }

    return {
      thread: {
        ...threadResponse,
        res: threadCache.res.concat(threadResponse.res),
      },
      noChangeFlg: false,
    };
  }

  /**
   * 2ch 系の status 203 レスポンスを解析する。
   * キャッシュの有無と delta フラグによってソースを切り替える。
   */
  private _parse203Response({
    response,
    cache,
    hasCache,
    deltaFlg,
    isHtml,
    format2chnet,
  }: {
    response: HttpResponse;
    cache: Cache;
    hasCache: boolean;
    deltaFlg: boolean;
    isHtml: boolean;
    format2chnet: string | null | undefined;
  }): ParsedThread | undefined {
    if (!hasCache) {
      return parseThread(this.url, response.body, { format2chnet }) ?? undefined;
    }
    if (deltaFlg && isHtml) {
      return cache.parsed as ParsedThread;
    }
    return parseThread(this.url, cache.data ?? "", { format2chnet }) ?? undefined;
  }

  // -------------------------------------------------------------------------
  // Private: スレッドへの後処理
  // -------------------------------------------------------------------------

  /**
   * 板スレ一覧のレス数と突き合わせ、不足分をあぼーんで補填する。
   *
   * 変更理由: 板一覧キャッシュの未取得・不完全な subject.txt・URL の表記揺れでも
   * not_found になり得るため、ここでは expired として扱わず独立した信号にする。
   * ブラウザ画面での自動更新停止と通知は、取得結果を受け取った側でこの信号も含めて判断する。
   */
  private _padAbobunIfNeeded(thread: ParsedThread, result: CachedInfoResult): void {
    if (result.status === "success" || result.status === "sucess") {
      while (thread.res.length < (result.cachedInfo?.resCount ?? 0)) {
        thread.res.push({
          name: "あぼーん",
          mail: "あぼーん",
          message: "あぼーん",
          other: "あぼーん",
        });
      }
    }
    // 変更理由: subject.txt 不在を expired と同一視すると、コアの dat 落ち判定が
    // 不正確になるため、画面側が自動更新停止の要否を選べる独立した状態として保持する。
    this.missingFromSubject = isMissingFromSubject(result.status);
  }

  /** パース済みスレッドの内容をインスタンスフィールドに反映する */
  private _applyThreadToSelf(thread: ParsedThread): void {
    this.title = thread.title ?? null;
    this.res = thread.res;
    // 変更理由: `!= null` はプロパティの存在チェックであり、`expired: false` でも
    // true と判定されてしまう。明示的に true が設定されている場合のみ dat 落ちとみなす。
    this.expired = thread.expired === true;
  }

  // -------------------------------------------------------------------------
  // Private: キャッシュ更新
  // -------------------------------------------------------------------------

  /**
   * フェッチ成功後のキャッシュ更新を行う。
   * resolve() 後に fire-and-forget で呼ばれるため、例外を外部に漏らさないこと。
   */
  private async _updateCacheAfterFetch({
    cache,
    response,
    thread,
    deltaFlg,
    isHtml,
    readcgiVer,
    noChangeFlg,
    hasCache,
  }: UpdateCacheParams): Promise<void> {
    if (response?.status === 200 || (readcgiVer >= 6 && response?.status === 500)) {
      cache.lastUpdated = Date.now();

      if (isHtml && response) {
        const detectedVer = this._extractReadcgiVer(response.body);
        readcgiVer = detectedVer ?? readcgiVer;

        if (thread.expired) {
          container.bookmark.updateExpired(this.url.url.href, true);
        }
      }

      if (deltaFlg) {
        if (isHtml && !noChangeFlg) {
          cache.parsed = thread;
          cache.readcgiVer = readcgiVer;
        } else if (!noChangeFlg && response) {
          cache.data = (cache.data ?? "") + response.body;
        }
      } else {
        if (isHtml) {
          cache.parsed = thread;
          cache.readcgiVer = readcgiVer;
        } else if (response) {
          cache.data = response.body;
        }
      }

      cache.resLength = thread.res.length;

      if (response) {
        const lastModified = new Date(response.headers["Last-Modified"] || "dummy").getTime();
        if (Number.isFinite(lastModified)) {
          cache.lastModified = lastModified;
        }
        const etag = response.headers["ETag"];
        if (etag) {
          cache.etag = etag;
        }
      }

      // 変更理由: 閲覧ログとして恒久保存できるよう、スレのメタ情報を付与する。
      this._applyLogMetadata(cache, thread);
      await cache.put();
      this._notifyLogUpdated();
    } else if (hasCache && response?.status === 304) {
      cache.lastUpdated = Date.now();
      // 304(変化なし)でもログのメタを最新化しておく（kind 未設定の旧キャッシュ救済）。
      this._applyLogMetadata(cache, thread);
      await cache.put();
      this._notifyLogUpdated();
    }
  }

  /**
   * キャッシュにログ用のメタ情報（スレタイ・板URL・種別）を付与する。
   * 閲覧したスレは常にログとして恒久保存する（kind="thread"）。
   */
  private _applyLogMetadata(cache: Cache, thread: ParsedThread): void {
    cache.title = thread.title ?? cache.title ?? "";
    // url(キャッシュキー)は dat パスのため、スレ再表示用の URL を別途保存する。
    cache.threadUrl = this.url.url.href;
    try {
      cache.boardUrl = this.url.toBoard().url.href;
    } catch {
      // toBoard() はスレURL以外で例外。その場合は板URLを空のままにする。
    }
    cache.kind = "thread";
  }

  /** ログ一覧へ更新を通知する（一覧側で再読込させる）。 */
  private _notifyLogUpdated(): void {
    container.message.send("log_updated", { url: this.url.url.href });
  }

  /**
   * レスポンスボディから read.cgi のバージョン番号を抽出する。
   * 見つからない場合は null を返す。
   */
  private _extractReadcgiVer(body: string): number | null {
    const marker = '<div class="footer push">read.cgi ver ';
    const idx = body.indexOf(marker);
    if (idx === -1) return null;
    const ver = parseInt(body.substr(idx + marker.length, 2));
    return Number.isNaN(ver) ? null : ver;
  }

  // -------------------------------------------------------------------------
  // Private: エラーメッセージ生成
  // -------------------------------------------------------------------------

  /**
   * ドメイン別のエラーメッセージを生成するエントリポイント。
   * tsld によってドメイン固有の処理に振り分ける。
   */
  private async _buildDomainErrorMessage({
    response,
    hasCache,
    thread,
  }: {
    response: HttpResponse | undefined;
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): Promise<string> {
    if (this.tsld === "5ch.io" && response) {
      return this._build5chioErrorMessage({ response, hasCache, thread });
    }
    if (this.tsld === "shitaraba.net" && !this.url.isArchive) {
      return this._buildShitarabaErrorMessage(response);
    }
    return this._buildDefaultErrorMessage({ hasCache, thread });
  }

  /**
   * 5ch.io 向けエラーメッセージ。
   * サーバー移転検出を試み、移転先 URL をメッセージに含める。
   */
  private async _build5chioErrorMessage({
    response,
    hasCache,
    thread,
  }: {
    response: HttpResponse;
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): Promise<string> {
    let message = "";
    try {
      const newBoardURL = await chServerMoveDetect(this.url.toBoard());
      const newUrl = new ChURL(this.url.url.href);
      newUrl.url.hostname = newBoardURL.hostname;
      const href = container.util.escapeHtml(container.util.safeHref(newUrl.url.href));
      const label = container.util.escapeHtml(newUrl.url.href);
      message += `スレッドの読み込みに失敗しました。\nサーバーが移転している可能性が有ります\n(<a href="${href}" class="open_in_rcrx">${label}</a>)`;
    } catch {
      if (response.status === 203) {
        message += "dat落ちしたスレッドです。";
        if (thread) thread.expired = true;
      } else {
        message += "スレッドの読み込みに失敗しました。";
      }
    }
    if (hasCache && !thread) {
      message += "キャッシュに残っていたデータを表示します。";
    }
    return message;
  }

  /**
   * したらば向けエラーメッセージ。
   * レスポンスの error ヘッダーによって詳細なメッセージを付加する。
   */
  private _buildShitarabaErrorMessage(response: HttpResponse | undefined): string {
    let message = "スレッドの読み込みに失敗しました。";
    const errorHeader = response?.headers?.error;
    if (errorHeader == null) return message;

    switch (errorHeader) {
      case "BBS NOT FOUND":
        message += "\nURLの掲示板番号が間違っています。";
        break;
      case "KEY NOT FOUND":
        message += "\nURLのスレッド番号が間違っています。";
        break;
      case "THREAD NOT FOUND":
        message +=
          "\n該当するスレッドは存在しません。\nURLが間違っているか過去ログに移動せずに削除されています。";
        break;
      case "STORAGE IN": {
        const newUrl = this.url.url.href.replace("/read.cgi/", "/read_archive.cgi/");
        const href = container.util.escapeHtml(container.util.safeHref(newUrl));
        const label = container.util.escapeHtml(newUrl);
        message += `\n過去ログが存在します\n(<a href="${href}" class="open_in_rcrx">${label}</a>)`;
        break;
      }
    }
    return message;
  }

  /** デフォルトのエラーメッセージ（ドメイン固有処理なし） */
  private _buildDefaultErrorMessage({
    hasCache,
    thread,
  }: {
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): string {
    let message = "スレッドの読み込みに失敗しました。";
    if (hasCache && !thread) {
      message += "キャッシュに残っていたデータを表示します。";
    }
    return message;
  }

  // -------------------------------------------------------------------------
  // Static helpers (変更なし)
  // -------------------------------------------------------------------------

  static _getXhrInfo(url: ChURL): XhrInfo | null {
    return getThreadXhrInfo(url, container.config.get("format_2chnet"));
  }

  static parse(url: ChURL, text: string, resLength?: number): ParsedThread | null {
    return parseThread(url, text, {
      format2chnet: container.config.get("format_2chnet"),
      resLength,
    });
  }

  static _parseNet(text: string): ParsedThread | null {
    return parseNetThread(text);
  }

  static _parseCh(text: string): ParsedThread | null {
    return parseChThread(text);
  }

  static _parseMachi(text: string): ParsedThread | null {
    return parseMachiThread(text);
  }

  static _parseJbbs(text: string): ParsedThread | null {
    return parseJbbsThread(text);
  }

  static _parseJbbsArchive(text: string): ParsedThread | null {
    return parseJbbsArchiveThread(text);
  }

  static _parsePink(text: string, resLength?: number): ParsedThread | null {
    return parsePinkThread(text, resLength);
  }
}

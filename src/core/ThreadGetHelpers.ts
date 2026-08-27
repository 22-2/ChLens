import type { HttpResponse } from "src/app/platform/types";
import type { ParsedThread } from "src/core/ThreadParser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ThreadFetchPlanInput {
  tsld: string;
  isArchive: boolean;
  isHtml: boolean;
  hasCache: boolean;
  basePath: string;
  cacheResLength?: number | null;
  cacheReadcgiVer?: number | null;
}

export interface ThreadFetchPlan {
  xhrPath: string;
  deltaFlg: boolean;
  readcgiVer: number;
}

export interface ConditionalHeaderInput {
  hasCache: boolean;
  lastModified?: number | null;
  etag?: string | null;
}

/** parseThread 互換の関数型エイリアス（テスト差し替え可能にするため） */
export type ParseThreadFn<TUrl> = (
  url: TUrl,
  body: string,
  options: { format2chnet?: string | null; resLength?: number },
) => ParsedThread | null;

export interface ResolveThreadFromResponseInput<TUrl = unknown> {
  response?: HttpResponse;
  readcgiVer: number;
  deltaFlg: boolean;
  isHtml: boolean;
  bbsType: string;
  hasCache: boolean;
  cacheData?: string | null;
  cacheParsed?: ParsedThread | null;
  cacheResLength?: number | null;
  url: TUrl;
  format2chnet?: string | null;
  parseThreadFn: ParseThreadFn<TUrl>;
}

export interface ResolveThreadFromResponseResult {
  thread?: ParsedThread;
  noChangeFlg: boolean;
  parseFailed: boolean;
}

export interface RejectThreadResultInput {
  thread?: ParsedThread;
  response?: HttpResponse;
  bbsType: string;
  readcgiVer: number;
  hasCache: boolean;
}

export interface ApplyCachedInfoInput {
  thread: ParsedThread;
  status?: string;
  cachedResCount?: number;
}

/**
 * subject.txt の取得には成功したが、対象スレッドが一覧に存在しなかったかを返す。
 *
 * expired とは分離し、一覧の欠落やURL表記揺れをコア層で dat 落ちと断定しないための判定。
 * 自動更新を停止するかどうかは、画面側で expired と合わせて判断する。
 */
export const isMissingFromSubject = (status?: string): boolean => status === "not_found";

// ---------------------------------------------------------------------------
// buildThreadFetchPlan
// ---------------------------------------------------------------------------

/**
 * URL・差分フラグ・readcgi バージョンを含むフェッチ計画を返す。
 * ミュータブルな変数を使わず、各分岐で即座に return する。
 */
export const buildThreadFetchPlan = ({
  tsld,
  isArchive,
  isHtml,
  hasCache,
  basePath,
  cacheResLength,
  cacheReadcgiVer,
}: ThreadFetchPlanInput): ThreadFetchPlan => {
  const resLength = +(cacheResLength || 0);

  // しらたば / まちBBS: 差分取得のみ。readcgiVer は使用しない
  if ((tsld === "shitaraba.net" && !isArchive) || tsld === "machi.to") {
    if (!hasCache) return { xhrPath: basePath, deltaFlg: false, readcgiVer: 5 };
    return {
      xhrPath: `${basePath}${resLength + 1}-`,
      deltaFlg: true,
      readcgiVer: 5,
    };
  }

  // HTML スレ (5ch 系 read.cgi)
  if (isHtml) {
    if (!hasCache) return { xhrPath: `${basePath}?v=pc`, deltaFlg: false, readcgiVer: 5 };
    const readcgiVer = cacheReadcgiVer || 5;
    const suffix = readcgiVer >= 6 ? `${resLength + 1}-n` : `${resLength}-n`;
    return { xhrPath: `${basePath}${suffix}?v=pc`, deltaFlg: true, readcgiVer };
  }

  // dat 形式（差分なし）
  return { xhrPath: basePath, deltaFlg: false, readcgiVer: 5 };
};

// ---------------------------------------------------------------------------
// buildConditionalRequestHeaders
// ---------------------------------------------------------------------------

export const buildConditionalRequestHeaders = ({
  hasCache,
  lastModified,
  etag,
}: ConditionalHeaderInput): Record<string, string> => {
  if (!hasCache) return {};

  const headers: Record<string, string> = {};
  if (lastModified != null) {
    headers["If-Modified-Since"] = new Date(lastModified).toUTCString();
  }
  if (etag != null) {
    headers["If-None-Match"] = etag;
  }
  return headers;
};

// ---------------------------------------------------------------------------
// resolveThreadFromResponse — internal helpers
// ---------------------------------------------------------------------------

/** resolveThreadFromResponse 内のサブ関数が共有するパラメータ群 */
interface ResolveCommonParams<TUrl> {
  url: TUrl;
  format2chnet?: string | null;
  parseThreadFn: ParseThreadFn<TUrl>;
  cacheData?: string | null;
  cacheParsed?: ParsedThread | null;
  cacheResLength?: number | null;
}

/**
 * delta + HTML 形式の合成処理。
 * readcgiVer と差分レス数に応じてキャッシュと新規レスを合成する。
 */
const resolveDeltaHtml = <TUrl>(
  response: HttpResponse,
  readcgiVer: number,
  { url, format2chnet, parseThreadFn, cacheParsed, cacheResLength }: ResolveCommonParams<TUrl>,
): ResolveThreadFromResponseResult => {
  const threadCache = cacheParsed as ParsedThread;

  // readcgiVer >= 6 の status 500 は「変化なし」を意味する
  if (readcgiVer >= 6 && response.status === 500) {
    return { thread: threadCache, noChangeFlg: true, parseFailed: false };
  }

  const threadResponse = parseThreadFn(url, response.body, {
    format2chnet,
    resLength: +(cacheResLength || 0),
  });

  if (!threadResponse) {
    return { thread: undefined, noChangeFlg: false, parseFailed: true };
  }

  // readcgiVer < 6 で差分が 1 件のみ = 変化なし
  if (readcgiVer < 6 && threadResponse.res.length === 1) {
    return { thread: threadCache, noChangeFlg: true, parseFailed: false };
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
    parseFailed: false,
  };
};

/**
 * status 200 / readcgiVer >= 6 & status 500 のレスポンスを解析する。
 * 全取得・dat 差分・HTML 差分の 3 パターンを早期リターンで分岐する。
 */
const resolveSuccessResponse = <TUrl>(
  response: HttpResponse,
  deltaFlg: boolean,
  isHtml: boolean,
  readcgiVer: number,
  common: ResolveCommonParams<TUrl>,
): ResolveThreadFromResponseResult => {
  const { url, format2chnet, parseThreadFn, cacheData } = common;

  // 全取得
  if (!deltaFlg) {
    return {
      thread: parseThreadFn(url, response.body, { format2chnet }) ?? undefined,
      noChangeFlg: false,
      parseFailed: false,
    };
  }

  // 差分取得・dat 形式
  if (!isHtml) {
    return {
      thread:
        parseThreadFn(url, (cacheData ?? "") + response.body, {
          format2chnet,
        }) ?? undefined,
      noChangeFlg: false,
      parseFailed: false,
    };
  }

  // 差分取得・HTML 形式
  return resolveDeltaHtml(response, readcgiVer, common);
};

/**
 * 2ch 系 status 203 のレスポンスを解析する。
 * キャッシュの有無と delta フラグによってソースを切り替える。
 */
const resolve203Response = <TUrl>(
  response: HttpResponse | undefined,
  hasCache: boolean,
  deltaFlg: boolean,
  isHtml: boolean,
  { url, format2chnet, parseThreadFn, cacheData, cacheParsed }: ResolveCommonParams<TUrl>,
): ParsedThread | undefined => {
  if (!hasCache) {
    return parseThreadFn(url, response?.body ?? "", { format2chnet }) ?? undefined;
  }
  if (deltaFlg && isHtml) {
    return cacheParsed as ParsedThread;
  }
  return parseThreadFn(url, cacheData ?? "", { format2chnet }) ?? undefined;
};

/**
 * キャッシュからスレッドを復元するフォールバック。
 * 通信失敗時やステータス不明時に使用する。
 */
const resolveFromCache = <TUrl>(
  isHtml: boolean,
  { url, format2chnet, parseThreadFn, cacheData, cacheParsed }: ResolveCommonParams<TUrl>,
): ParsedThread | undefined => {
  if (isHtml) return cacheParsed as ParsedThread;
  return parseThreadFn(url, cacheData ?? "", { format2chnet }) ?? undefined;
};

// ---------------------------------------------------------------------------
// resolveThreadFromResponse — public entry point
// ---------------------------------------------------------------------------

/**
 * HTTP レスポンスとキャッシュ状態からスレッドを組み立てる。
 * ステータスコードによる分岐のエントリポイント。
 * 各ケースは専用のサブ関数に委譲する。
 */
export const resolveThreadFromResponse = <TUrl>({
  response,
  readcgiVer,
  deltaFlg,
  isHtml,
  bbsType,
  hasCache,
  cacheData,
  cacheParsed,
  cacheResLength,
  url,
  format2chnet,
  parseThreadFn,
}: ResolveThreadFromResponseInput<TUrl>): ResolveThreadFromResponseResult => {
  const common: ResolveCommonParams<TUrl> = {
    url,
    format2chnet,
    parseThreadFn,
    cacheData,
    cacheParsed,
    cacheResLength,
  };
  const status = response?.status;

  if (status === 200 || (readcgiVer >= 6 && status === 500)) {
    return resolveSuccessResponse(response!, deltaFlg, isHtml, readcgiVer, common);
  }

  if (bbsType === "2ch" && status === 203) {
    return {
      thread: resolve203Response(response, hasCache, deltaFlg, isHtml, common),
      noChangeFlg: false,
      parseFailed: false,
    };
  }

  if (hasCache) {
    return {
      thread: resolveFromCache(isHtml, common),
      noChangeFlg: false,
      parseFailed: false,
    };
  }

  return { thread: undefined, noChangeFlg: false, parseFailed: false };
};

// ---------------------------------------------------------------------------
// shouldRejectThreadResult
// ---------------------------------------------------------------------------

/**
 * パース結果を reject すべきか判定する。
 * - thread が取得できなかった場合
 * - 2ch 系の 203（dat 落ち）: スレッドは取得できても reject する
 * - 上記以外でステータスが想定外かつキャッシュも存在しない場合
 */
export const shouldRejectThreadResult = ({
  thread,
  response,
  bbsType,
  readcgiVer,
  hasCache,
}: RejectThreadResultInput): boolean => {
  if (!thread) return true;
  if (bbsType === "2ch" && response?.status === 203) return true;

  return (
    response?.status !== 200 &&
    response?.status !== 304 &&
    (!(readcgiVer >= 6) || response?.status !== 500) &&
    (!!response || !hasCache)
  );
};

// ---------------------------------------------------------------------------
// applyCachedInfoToThread
// ---------------------------------------------------------------------------

/**
 * 板スレ一覧のレス数と突き合わせ、不足分をあぼーんで補填する。
 *
 * 変更理由: 板一覧キャッシュの not_found は不完全な subject.txt や URL の表記揺れでも
 * 発生するため、ここでは dat 落ちの根拠として expired に変換しない。自動更新の停止は
 * 取得結果を受け取った画面側で、表示通知と同じタイミングに判断する。
 */
export const applyCachedInfoToThread = ({
  thread,
  status,
  cachedResCount,
}: ApplyCachedInfoInput): void => {
  if (status === "success" || status === "sucess") {
    while (thread.res.length < (cachedResCount ?? 0)) {
      thread.res.push({
        name: "あぼーん",
        mail: "あぼーん",
        message: "あぼーん",
        other: "あぼーん",
      });
    }
  }
};

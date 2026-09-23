export interface ThreadResponse {
  status: number;
  body: string;
  headers?: Readonly<Record<string, string>>;
  url?: string;
}

export interface ThreadLike<TPost> {
  res: TPost[];
}

export type ParseThreadFn<TUrl, TThread> = (
  url: TUrl,
  body: string,
  options: { format2chnet?: string | null; resLength?: number },
) => TThread | null;

export interface ResolveThreadFromResponseInput<TUrl, TThread extends ThreadLike<unknown>> {
  response?: ThreadResponse;
  readcgiVer: number;
  deltaFlg: boolean;
  isHtml: boolean;
  bbsType: string;
  hasCache: boolean;
  cacheData?: string | null;
  cacheParsed?: TThread | null;
  cacheResLength?: number | null;
  url: TUrl;
  format2chnet?: string | null;
  parseThreadFn: ParseThreadFn<TUrl, TThread>;
}

export interface ResolveThreadFromResponseResult<TThread> {
  thread?: TThread;
  noChangeFlg: boolean;
  parseFailed: boolean;
}

export interface RejectThreadResultInput<TThread> {
  thread?: TThread;
  response?: ThreadResponse;
  bbsType: string;
  readcgiVer: number;
  hasCache: boolean;
}

interface ResolveCommonParams<TUrl, TThread extends ThreadLike<unknown>> {
  url: TUrl;
  format2chnet?: string | null;
  parseThreadFn: ParseThreadFn<TUrl, TThread>;
  cacheData?: string | null;
  cacheParsed?: TThread | null;
  cacheResLength?: number | null;
}

const resolveDeltaHtml = <TUrl, TThread extends ThreadLike<unknown>>(
  response: ThreadResponse,
  readcgiVer: number,
  {
    url,
    format2chnet,
    parseThreadFn,
    cacheParsed,
    cacheResLength,
  }: ResolveCommonParams<TUrl, TThread>,
): ResolveThreadFromResponseResult<TThread> => {
  const threadCache = cacheParsed;
  if (!threadCache) return { thread: undefined, noChangeFlg: false, parseFailed: true };

  if (readcgiVer >= 6 && response.status === 500) {
    return { thread: threadCache, noChangeFlg: true, parseFailed: false };
  }

  const threadResponse = parseThreadFn(url, response.body, {
    format2chnet,
    resLength: +(cacheResLength || 0),
  });
  if (!threadResponse) return { thread: undefined, noChangeFlg: false, parseFailed: true };

  if (readcgiVer < 6 && threadResponse.res.length === 1) {
    return { thread: threadCache, noChangeFlg: true, parseFailed: false };
  }

  // 旧read.cgiは差分の先頭に既存の最終レスを含めるため、重複分だけを取り除く。
  if (readcgiVer < 6) threadResponse.res.shift();

  return {
    thread: { ...threadResponse, res: threadCache.res.concat(threadResponse.res) },
    noChangeFlg: false,
    parseFailed: false,
  };
};

const resolveSuccessResponse = <TUrl, TThread extends ThreadLike<unknown>>(
  response: ThreadResponse,
  deltaFlg: boolean,
  isHtml: boolean,
  readcgiVer: number,
  common: ResolveCommonParams<TUrl, TThread>,
): ResolveThreadFromResponseResult<TThread> => {
  const { url, format2chnet, parseThreadFn, cacheData } = common;
  if (!deltaFlg) {
    return {
      thread: parseThreadFn(url, response.body, { format2chnet }) ?? undefined,
      noChangeFlg: false,
      parseFailed: false,
    };
  }
  if (!isHtml) {
    return {
      thread: parseThreadFn(url, (cacheData ?? "") + response.body, { format2chnet }) ?? undefined,
      noChangeFlg: false,
      parseFailed: false,
    };
  }
  return resolveDeltaHtml(response, readcgiVer, common);
};

const resolve203Response = <TUrl, TThread extends ThreadLike<unknown>>(
  response: ThreadResponse | undefined,
  hasCache: boolean,
  deltaFlg: boolean,
  isHtml: boolean,
  { url, format2chnet, parseThreadFn, cacheData, cacheParsed }: ResolveCommonParams<TUrl, TThread>,
): TThread | undefined => {
  if (!hasCache) return parseThreadFn(url, response?.body ?? "", { format2chnet }) ?? undefined;
  if (deltaFlg && isHtml) return cacheParsed ?? undefined;
  return parseThreadFn(url, cacheData ?? "", { format2chnet }) ?? undefined;
};

const resolveFromCache = <TUrl, TThread extends ThreadLike<unknown>>(
  isHtml: boolean,
  { url, format2chnet, parseThreadFn, cacheData, cacheParsed }: ResolveCommonParams<TUrl, TThread>,
): TThread | undefined => {
  if (isHtml) return cacheParsed ?? undefined;
  return parseThreadFn(url, cacheData ?? "", { format2chnet }) ?? undefined;
};

/** HTTP状態・キャッシュ・掲示板形式から、表示に渡すスレッドを復元する純粋処理。 */
export function resolveThreadFromResponse<TUrl, TThread extends ThreadLike<unknown>>({
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
}: ResolveThreadFromResponseInput<TUrl, TThread>): ResolveThreadFromResponseResult<TThread> {
  const common: ResolveCommonParams<TUrl, TThread> = {
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
}

/** アプリ側で失敗扱いにするHTTP結果を共通の掲示板規則で判定する。 */
export function shouldRejectThreadResult<TThread>({
  thread,
  response,
  bbsType,
  readcgiVer,
  hasCache,
}: RejectThreadResultInput<TThread>): boolean {
  if (!thread) return true;
  if (bbsType === "2ch" && response?.status === 203) return true;
  return (
    response?.status !== 200 &&
    response?.status !== 304 &&
    (!(readcgiVer >= 6) || response?.status !== 500) &&
    (!!response || !hasCache)
  );
}

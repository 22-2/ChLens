import {
  buildConditionalRequestHeaders,
  buildThreadFetchPlan,
  type ThreadFetchPlan,
  type ThreadFetchPlanInput,
} from "./ThreadFetchPolicy";
import {
  type ParseThreadFn,
  resolveThreadFromResponse,
  type ResolveThreadFromResponseResult,
  shouldRejectThreadResult,
  type ThreadLike,
  type ThreadResponse,
} from "./ThreadResponseResolver";

export interface ThreadFetchTransport {
  fetch(
    path: string,
    charset: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<ThreadResponse>;
}

export interface ThreadFetchFallback {
  path: string;
  charset: string;
}

export interface ThreadFetchExecutorInput<TUrl, TThread extends ThreadLike<unknown>> extends Omit<
  ThreadFetchPlanInput,
  "basePath"
> {
  basePath: string;
  charset: string;
  lastModified?: number | null;
  etag?: string | null;
  bbsType: string;
  cacheData?: string | null;
  cacheParsed?: TThread | null;
  url: TUrl;
  format2chnet?: string | null;
  parseThreadFn: ParseThreadFn<TUrl, TThread>;
}

export interface ThreadFetchExecution<TThread> extends ResolveThreadFromResponseResult<TThread> {
  plan: ThreadFetchPlan;
  response?: ThreadResponse;
  rejected: boolean;
  usedFallback?: true;
}

async function tryFallback<TUrl, TThread extends ThreadLike<unknown>>(
  input: ThreadFetchExecutorInput<TUrl, TThread>,
  transport: ThreadFetchTransport,
  fallbacks: readonly ThreadFetchFallback[],
  plan: ThreadFetchPlan,
): Promise<ThreadFetchExecution<TThread> | null> {
  for (const fallback of fallbacks) {
    try {
      const response = await transport.fetch(fallback.path, fallback.charset, {});
      // 過去ログの候補は全量HTMLなので、設定や通常取得のdat形式を引き継がずHTMLとして解析する。
      const resolved = resolveThreadFromResponse({
        response,
        readcgiVer: 5,
        deltaFlg: false,
        isHtml: true,
        bbsType: "2ch",
        hasCache: false,
        url: input.url,
        format2chnet: null,
        parseThreadFn: input.parseThreadFn,
      });
      const rejected = shouldRejectThreadResult({
        thread: resolved.thread,
        response,
        bbsType: "2ch",
        readcgiVer: 5,
        hasCache: false,
      });
      if (!rejected) {
        return {
          ...resolved,
          plan: { ...plan, xhrPath: fallback.path, deltaFlg: false, readcgiVer: 5 },
          response,
          rejected: false,
          usedFallback: true,
        };
      }
    } catch (error) {
      // ミラー障害の内容を残しつつ、次の候補があれば続けて確認できるようにする。
      console.error("[ThreadFetchExecutor] 過去ログ候補の取得に失敗しました:", fallback.path, error);
    }
  }
  return null;
}

/**
 * 共通のスレッド取得手順を実行する。
 * キャッシュの読み書きは呼び出し側に残し、transportだけをブラウザ/MCP間で差し替える。
 */
export async function executeThreadFetch<TUrl, TThread extends ThreadLike<unknown>>(
  input: ThreadFetchExecutorInput<TUrl, TThread>,
  transport?: ThreadFetchTransport,
  fallbacks: readonly ThreadFetchFallback[] = [],
): Promise<ThreadFetchExecution<TThread>> {
  const plan = buildThreadFetchPlan(input);
  const requestHeaders = buildConditionalRequestHeaders({
    hasCache: input.hasCache,
    lastModified: input.lastModified,
    etag: input.etag,
  });
  let response: ThreadResponse | undefined;
  let primaryError: unknown;
  let primaryFetchFailed = false;
  try {
    response = transport
      ? await transport.fetch(plan.xhrPath, input.charset, requestHeaders)
      : undefined;
  } catch (error) {
    primaryError = error;
    primaryFetchFailed = true;
  }
  if (primaryFetchFailed) {
    if (transport && fallbacks.length > 0) {
      const fallback = await tryFallback(input, transport, fallbacks, plan);
      if (fallback) return fallback;
    }
    throw primaryError;
  }
  const resolved = resolveThreadFromResponse({
    response,
    readcgiVer: plan.readcgiVer,
    deltaFlg: plan.deltaFlg,
    isHtml: input.isHtml,
    bbsType: input.bbsType,
    hasCache: input.hasCache,
    cacheData: input.cacheData,
    cacheParsed: input.cacheParsed,
    cacheResLength: input.cacheResLength,
    url: input.url,
    format2chnet: input.format2chnet,
    parseThreadFn: input.parseThreadFn,
  });

  const execution: ThreadFetchExecution<TThread> = {
    ...resolved,
    plan,
    response,
    rejected: shouldRejectThreadResult({
      thread: resolved.thread,
      response,
      bbsType: input.bbsType,
      readcgiVer: plan.readcgiVer,
      hasCache: input.hasCache,
    }),
  };
  if (execution.rejected && transport && fallbacks.length > 0) {
    return (await tryFallback(input, transport, fallbacks, plan)) ?? execution;
  }
  return execution;
}

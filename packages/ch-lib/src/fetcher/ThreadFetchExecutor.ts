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
}

/**
 * 共通のスレッド取得手順を実行する。
 * キャッシュの読み書きは呼び出し側に残し、transportだけをブラウザ/MCP間で差し替える。
 */
export async function executeThreadFetch<TUrl, TThread extends ThreadLike<unknown>>(
  input: ThreadFetchExecutorInput<TUrl, TThread>,
  transport?: ThreadFetchTransport,
): Promise<ThreadFetchExecution<TThread>> {
  const plan = buildThreadFetchPlan(input);
  const requestHeaders = buildConditionalRequestHeaders({
    hasCache: input.hasCache,
    lastModified: input.lastModified,
    etag: input.etag,
  });
  const response = transport
    ? await transport.fetch(plan.xhrPath, input.charset, requestHeaders)
    : undefined;
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

  return {
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
}

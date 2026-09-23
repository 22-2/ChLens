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

/**
 * 掲示板ごとの差分取得規則から HTTP リクエスト計画を作る。
 * キャッシュの保存や通信の実行は呼び出し側へ残し、同じ規則を全取得経路で共有する。
 */
export function buildThreadFetchPlan({
  tsld,
  isArchive,
  isHtml,
  hasCache,
  basePath,
  cacheResLength,
  cacheReadcgiVer,
}: ThreadFetchPlanInput): ThreadFetchPlan {
  const resLength = +(cacheResLength || 0);

  // しらたば / まちBBSはレス番号を指定する差分形式を使い、read.cgiの版番号を参照しない。
  if ((tsld === "shitaraba.net" && !isArchive) || tsld === "machi.to") {
    if (!hasCache) return { xhrPath: basePath, deltaFlg: false, readcgiVer: 5 };
    return { xhrPath: `${basePath}${resLength + 1}-`, deltaFlg: true, readcgiVer: 5 };
  }

  if (isHtml) {
    if (!hasCache) return { xhrPath: `${basePath}?v=pc`, deltaFlg: false, readcgiVer: 5 };
    const readcgiVer = cacheReadcgiVer || 5;
    const suffix = readcgiVer >= 6 ? `${resLength + 1}-n` : `${resLength}-n`;
    return { xhrPath: `${basePath}${suffix}?v=pc`, deltaFlg: true, readcgiVer };
  }

  return { xhrPath: basePath, deltaFlg: false, readcgiVer: 5 };
}

/** キャッシュがある場合だけ、HTTPの条件付きGETヘッダーを作る。 */
export function buildConditionalRequestHeaders({
  hasCache,
  lastModified,
  etag,
}: ConditionalHeaderInput): Record<string, string> {
  if (!hasCache) return {};

  const headers: Record<string, string> = {};
  if (lastModified != null) headers["If-Modified-Since"] = new Date(lastModified).toUTCString();
  if (etag != null) headers["If-None-Match"] = etag;
  return headers;
}

import type { BoardTitleRequest } from "packages/chlib/src/index";
import { Request } from "src/core/network/HTTP";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface BoardSettingFetcher {
  /** 板設定（SETTING.TXTなど）の本文を返す。取得できないときは例外を投げる。 */
  fetch(request: BoardTitleRequest, options?: { force?: boolean }): Promise<string>;
}

class BoardSettingNotFoundError extends Error {}

async function fetchText(url: string, charset: BoardTitleRequest["charset"]) {
  return new Request("GET", url, {
    mimeType: `text/plain; charset=${charset === "shift_jis" ? "Shift_JIS" : "EUC-JP"}`,
    timeout: 10000,
  }).send();
}

async function fetchBoardSettingText(request: BoardTitleRequest): Promise<string> {
  let response = await fetchText(request.url, request.charset);
  // jpnknなどは SETTING.txt の小文字拡張子だけを公開するため、404のときに試す。
  if (response.status === 404 && request.source === "setting") {
    response = await fetchText(
      request.url.replace(/SETTING\.TXT$/, "SETTING.txt"),
      request.charset,
    );
  }
  if (response.status === 404) throw new BoardSettingNotFoundError(`HTTP ${response.status}`);
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response.body;
}

/**
 * 板設定の取得を一か所に集める。板名と レス上限が同じ設定を別々に取りに行かないよう、
 * 同じURLへの同時要求とTTL内の結果を共有する。
 * 設定が存在しない板（404）は短時間だけ負キャッシュし、周期処理から毎回取りに行かない。
 * 通信失敗などの一時的な失敗は次回に再取得できるよう残さない。
 */
export function createBoardSettingFetcher(): BoardSettingFetcher {
  const cache = new Map<string, { expires: number; promise: Promise<string> }>();

  function fetch(request: BoardTitleRequest, options: { force?: boolean } = {}): Promise<string> {
    const cached = cache.get(request.url);
    if (!options.force && cached && cached.expires > Date.now()) return cached.promise;

    const promise = fetchBoardSettingText(request);
    const entry = { expires: Date.now() + CACHE_TTL_MS, promise };
    cache.set(request.url, entry);
    promise.catch((error: unknown) => {
      // 後から置き換わったエントリは消さない。
      if (!(error instanceof BoardSettingNotFoundError) && cache.get(request.url) === entry) {
        cache.delete(request.url);
      }
    });
    return promise;
  }

  return { fetch };
}

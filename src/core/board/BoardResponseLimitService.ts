import {
  createBoardTitleRequest,
  getBoardNetwork,
  parseBoardResponseLimit,
} from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { Request } from "src/core/network/HTTP";

const logger = createLogger("core/board");
const CACHE_TTL_MS = 5 * 60 * 1000;

/** 選択した板の設定だけを取得し、同じ板への同時要求を共有する。 */
export function createBoardResponseLimitService() {
  const cache = new Map<string, { expires: number; promise: Promise<number | null> }>();
  async function get(threadUrl: string): Promise<number | null> {
    const network = getBoardNetwork(threadUrl);
    // 5ch系とエッヂは従来1000で満了する。可変の互換板・したらばは推測しない。
    const knownDefault = ["5ch", "bbspink", "eddibb"].includes(network) ? 1000 : null;
    const request = createBoardTitleRequest(threadUrl);
    if (!request) return null;
    const cached = cache.get(request.url);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = (async () => {
      try {
        let response = await new Request("GET", request.url, {
          mimeType: `text/plain; charset=${request.charset === "shift_jis" ? "Shift_JIS" : "EUC-JP"}`,
          timeout: 10000,
        }).send();
        // jpnknなどは SETTING.txt の小文字拡張子だけを公開するため、404のときに試す。
        if (response.status === 404 && request.source === "setting") {
          response = await new Request("GET", request.url.replace(/SETTING\.TXT$/, "SETTING.txt"), {
            mimeType: "text/plain; charset=Shift_JIS",
            timeout: 10000,
          }).send();
        }
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return parseBoardResponseLimit(response.body, request.source) ?? knownDefault;
      } catch (error) {
        logger.error("板のレス上限を取得できませんでした", { url: request.url, error });
        cache.delete(request.url);
        return knownDefault;
      }
    })();
    cache.set(request.url, { expires: Date.now() + CACHE_TTL_MS, promise });
    return promise;
  }
  return { get };
}

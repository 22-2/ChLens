import {
  createBoardTitleRequest,
  getBoardNetwork,
  parseBoardResponseLimit,
} from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import {
  type BoardSettingFetcher,
  createBoardSettingFetcher,
} from "src/core/board/BoardSettingFetcher";

const logger = createLogger("core/board");

/** 選択した板の設定からレス上限を求める。取得と共有は BoardSettingFetcher に任せる。 */
export function createBoardResponseLimitService(
  settingFetcher: BoardSettingFetcher = createBoardSettingFetcher(),
) {
  async function get(threadUrl: string): Promise<number | null> {
    const network = getBoardNetwork(threadUrl);
    // 5ch系とエッヂは従来1000で満了する。可変の互換板・したらばは推測しない。
    const knownDefault = ["5ch", "bbspink", "eddibb"].includes(network) ? 1000 : null;
    const request = createBoardTitleRequest(threadUrl);
    if (!request) return null;
    try {
      const body = await settingFetcher.fetch(request);
      return parseBoardResponseLimit(body, request.source) ?? knownDefault;
    } catch (error) {
      logger.error("板のレス上限を取得できませんでした", { url: request.url, error });
      return knownDefault;
    }
  }
  return { get };
}

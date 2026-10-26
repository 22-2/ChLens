import { ChURL } from "packages/chlib/src/url/ChURL";
import {
  getThreadListCache,
  setThreadListCache,
} from "src/features/thread-list/ui/thread-list-shared";

/** ログ削除後も古い既読表示が復元されないよう、保存済み一覧から既読情報を外す。 */
export async function clearCachedThreadReadState(threadUrl: string): Promise<void> {
  const canonicalBoard = new URL(new ChURL(threadUrl).toBoard().href);
  const originalHostBoard = new URL(threadUrl);
  // 変更理由: ChURLは5chのホスト別名を正規化する一方、一覧キャッシュのキーは
  // 開いた板のURLを使うため、正規化前後のホスト両方を確認して古いキャッシュを残さない。
  originalHostBoard.pathname = canonicalBoard.pathname;
  originalHostBoard.search = canonicalBoard.search;
  originalHostBoard.hash = "";
  const boardUrls = new Set([originalHostBoard.href, canonicalBoard.href]);

  for (const boardUrl of boardUrls) {
    const cachedThreads = await getThreadListCache(boardUrl);
    if (!cachedThreads) continue;

    let changed = false;
    const nextCachedThreads = cachedThreads.map((thread) => {
      if (thread.url !== threadUrl || !thread.readState) return thread;
      changed = true;
      return { ...thread, readState: undefined };
    });
    if (changed) await setThreadListCache(boardUrl, nextCachedThreads);
  }
}

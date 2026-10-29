import { createLogger } from "src/app/logger";
import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";

const logger = createLogger("view/browser");

interface DeleteThreadLogAndCloseTabOptions {
  threadUrl: string;
  closeTab: () => boolean;
  clearCachedReadState: (threadUrl: string) => Promise<void>;
  toast: IToastService;
}

/** ログ削除後も残る既読状態を、既読DBとブックマークの両方から消す。 */
async function deleteThreadLogAndClearReadState(
  threadUrl: string,
  clearCachedReadState: (threadUrl: string) => Promise<void>,
): Promise<number> {
  const deletedCount = await container.threadLog.deleteLog(threadUrl);
  await container.readState.remove(threadUrl);
  const clearedBookmarkReadState = await container.bookmark.clearReadState(threadUrl);
  if (!clearedBookmarkReadState) {
    throw new Error("ブックマークに保存された既読状態を解除できませんでした");
  }
  await clearCachedReadState(threadUrl);
  return deletedCount;
}

/** スレログ、閲覧履歴、ログ削除後に残る既読状態をまとめて削除する。 */
export async function deleteThreadLogAndHistory(
  threadUrl: string,
  clearCachedReadState: (threadUrl: string) => Promise<void>,
): Promise<number> {
  // 変更理由: ログと閲覧履歴を別々の操作で残さないよう、全てのログ削除入口で一緒に整理する。
  const deletedCount = await deleteThreadLogAndClearReadState(threadUrl, clearCachedReadState);
  const historyResult = await container.history.remove(threadUrl, null);
  if (historyResult instanceof Error) {
    throw historyResult;
  }
  return deletedCount;
}

/** 保存済みログを削除し、対象のスレタブを閉じる。 */
export async function deleteThreadLogAndCloseTab({
  threadUrl,
  closeTab,
  clearCachedReadState,
  toast,
}: DeleteThreadLogAndCloseTabOptions): Promise<void> {
  try {
    const deletedCount = await deleteThreadLogAndHistory(threadUrl, clearCachedReadState);
    const didCloseTab = closeTab();

    if (deletedCount === 0) {
      toast.info(
        didCloseTab
          ? "このスレのログは保存されていません。閲覧履歴を削除してタブを閉じました"
          : "このスレのログは保存されておらず、閲覧履歴を削除しました。タブは閉じられませんでした",
      );
      return;
    }

    toast.success(
      didCloseTab
        ? "スレログと閲覧履歴を削除してタブを閉じました"
        : "スレログと閲覧履歴を削除しました",
    );
  } catch (error: unknown) {
    logger.error("スレログと閲覧履歴の削除に失敗しました", { url: threadUrl, error });
    toast.error("スレログと閲覧履歴を削除できませんでした");
  }
}

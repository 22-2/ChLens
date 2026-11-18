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

/**
 * 保存側と表記がずれた同じスレの履歴も残さないよう、スレ単位でまとめて削除する。
 * 変更理由: 履歴はURLの完全一致で消すため、http/https・hash・ホスト別名の違いだけで
 * 削除されずに残ることがあった。
 */
async function deleteThreadHistory(threadUrl: string): Promise<void> {
  await container.history.removeThread(threadUrl);
}

/** 保存済みログを削除し、削除したことをログ一覧へ通知する。 */
async function deleteThreadLog(threadUrl: string): Promise<number> {
  const deletedCount = await container.threadLog.deleteLog(threadUrl);
  if (deletedCount > 0) {
    // 変更理由: ログ一覧は log_updated でしか再読込しないため、通知しないと
    // 削除後も古い行が残り「削除されていない」ように見える。
    container.message.send("log_updated", { url: threadUrl });
  }
  return deletedCount;
}

/** ログ削除後も残る既読状態を、既読DBとブックマークの両方から消す。 */
async function clearThreadReadState(
  threadUrl: string,
  clearCachedReadState: (threadUrl: string) => Promise<void>,
): Promise<void> {
  await container.readState.remove(threadUrl);
  const clearedBookmarkReadState = await container.bookmark.clearReadState(threadUrl);
  if (!clearedBookmarkReadState) {
    throw new Error("ブックマークに保存された既読状態を解除できませんでした");
  }
  await clearCachedReadState(threadUrl);
}

/** スレログ、閲覧履歴、ログ削除後に残る既読状態をまとめて削除する。 */
export async function deleteThreadLogAndHistory(
  threadUrl: string,
  clearCachedReadState: (threadUrl: string) => Promise<void>,
): Promise<number> {
  // 変更理由: ログと閲覧履歴を別々の操作で残さないよう、全てのログ削除入口で一緒に整理する。
  // 履歴は既読状態の後片付けより先に消し、後片付けの失敗で履歴が残らないようにする。
  const deletedCount = await deleteThreadLog(threadUrl);
  await deleteThreadHistory(threadUrl);
  await clearThreadReadState(threadUrl, clearCachedReadState);
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

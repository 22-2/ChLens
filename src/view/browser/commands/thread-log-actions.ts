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
export async function deleteThreadLogAndClearReadState(
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

/** 保存済みログを削除し、対象のスレタブを閉じる。 */
export async function deleteThreadLogAndCloseTab({
  threadUrl,
  closeTab,
  clearCachedReadState,
  toast,
}: DeleteThreadLogAndCloseTabOptions): Promise<void> {
  try {
    const deletedCount = await deleteThreadLogAndClearReadState(threadUrl, clearCachedReadState);
    const didCloseTab = closeTab();

    if (deletedCount === 0) {
      toast.info(
        didCloseTab
          ? "このスレのログは保存されていません。タブを閉じました"
          : "このスレのログは保存されておらず、タブも閉じられませんでした",
      );
      return;
    }

    toast.success(didCloseTab ? "スレログを削除してタブを閉じました" : "スレログを削除しました");
  } catch (error: unknown) {
    logger.error("スレログの削除に失敗しました", { url: threadUrl, error });
    toast.error("スレログを削除できませんでした");
  }
}

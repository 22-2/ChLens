import { createLogger } from "src/app/logger";
import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";

const logger = createLogger("view/browser");

interface DeleteThreadLogAndCloseTabOptions {
  threadUrl: string;
  closeTab: () => boolean;
  toast: IToastService;
}

/** 保存済みログを削除し、対象のスレタブを閉じる。 */
export async function deleteThreadLogAndCloseTab({
  threadUrl,
  closeTab,
  toast,
}: DeleteThreadLogAndCloseTabOptions): Promise<void> {
  try {
    const deletedCount = await container.threadLog.deleteLog(threadUrl);
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

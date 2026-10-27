import { Trash2 } from "lucide-react";
import { ChURL, getThreadXhrInfo, parseThread } from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { extractUrlsFromMessage } from "src/core/util/url-media";
import { container } from "src/service-container";
import {
  type BrowserCommandContext,
  getCommandSurface,
  getCommandToast,
} from "src/view/browser/commands/command-definition";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import { readConfigValue } from "src/view/browser/utils/config-setting";

const logger = createLogger("features/media");

function getThreadMessagesFromCache(parsed: unknown): string[] | null {
  if (typeof parsed !== "object" || parsed === null || !("res" in parsed)) {
    return null;
  }
  const responses = (parsed as { res?: unknown }).res;
  if (!Array.isArray(responses)) {
    return null;
  }
  return responses.flatMap((response: unknown) => {
    if (
      typeof response === "object" &&
      response !== null &&
      "message" in response &&
      typeof response.message === "string"
    ) {
      return [response.message];
    }
    return [];
  });
}

async function getCachedThreadMessages(threadUrl: string): Promise<string[]> {
  const thread = new ChURL(threadUrl);
  const format2chnet = readConfigValue("format_2chnet");
  const xhrInfo = getThreadXhrInfo(thread, format2chnet);
  if (!xhrInfo) {
    return [];
  }

  // 変更理由: 削除対象の確認でスレを再取得すると掲示板へ不要な通信を送るため、保存済みログだけを読む。
  const cache = container.cache.getCache(xhrInfo.path);
  await cache.get();
  const cachedMessages = getThreadMessagesFromCache(cache.parsed);
  if (cachedMessages) {
    return cachedMessages;
  }

  if (cache.data == null) {
    return [];
  }
  return (
    parseThread(thread, cache.data, {
      format2chnet,
      resLength: cache.resLength,
    })?.res.map((response) => response.message) ?? []
  );
}

async function runImgurBulkDelete(
  imageUrls: readonly string[] | undefined,
  context: BrowserCommandContext,
  label: string,
): Promise<void> {
  const toast = getCommandToast(context);
  const deletableUrls = await container.imgurImages.getDeletableImageUrls(imageUrls);
  if (deletableUrls.length === 0) {
    toast.info("削除できる投稿画像はありません");
    return;
  }

  if (
    !getCommandSurface(context).window.confirm(
      `${label}から、このアプリで投稿したImgur画像 ${deletableUrls.length} 件を削除します。元に戻せません。よろしいですか？`,
    )
  ) {
    return;
  }

  const result = await container.imgurImages.deleteImages(deletableUrls);
  if (result.failures.length > 0) {
    logger.error("Imgur画像の一括削除で一部失敗しました", {
      label,
      deletedCount: result.deletedCount,
      skippedCount: result.skippedCount,
      failures: result.failures,
    });
    toast.error(
      `Imgur画像を ${result.deletedCount} 件削除しました。${result.failures.length} 件は失敗しました。`,
    );
    return;
  }
  toast.success(`Imgur画像を ${result.deletedCount} 件削除しました`);
}

/** media 機能が所有する Imgur 一括削除コマンドを登録する。 */
export function registerMediaCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "media.delete-thread-imgur-images",
      label: "このスレの投稿画像を一括削除",
      englishLabel: "Delete Uploaded Images in Current Thread",
      description: "現在のスレに含まれる、このアプリから投稿したImgur画像をまとめて削除します",
      keywords: ["Imgur", "画像削除", "一括削除", "投稿画像"],
      group: "page",
      icon: Trash2,
      when: ({ viewPage }) => viewPage.type === "thread",
      run: async (context) => {
        if (context.viewPage.type !== "thread") return;
        const messages = await getCachedThreadMessages(context.viewPage.threadUrl);
        const imageUrls = messages.flatMap(extractUrlsFromMessage);
        await runImgurBulkDelete(imageUrls, context, "このスレ");
      },
    },
    { beforeCommandId: "page.toggle-filter-popular" },
  );
  api.addCommand(
    {
      id: "media.delete-all-imgur-images",
      label: "投稿したImgur画像をすべて削除",
      englishLabel: "Delete All Uploaded Imgur Images",
      description: "このアプリから投稿したImgur画像をすべて削除します",
      keywords: ["Imgur", "画像削除", "一括削除", "投稿画像", "すべて"],
      group: "page",
      icon: Trash2,
      run: (context) => runImgurBulkDelete(undefined, context, "すべての投稿画像"),
    },
    { beforeCommandId: "page.toggle-filter-popular" },
  );
}

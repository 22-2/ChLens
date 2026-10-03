import { resolveBoardUrlForBrowser } from "src/view/browser/utils/link-routing";

/**
 * レスのIDから、過去ログサービスのURLを組み立てる。
 * 変更理由: スレッド内の共有リンク生成はメディアURL判定と責務が異なるため、
 * メディア機能を移動しても汎用のThreadView操作だけで完結するよう別モジュールへ分離する。
 */
export function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  // 変更理由: 外部共有URLの生成に掲示板URLの位置依存パースを持ち込まず、板名とスレIDを意味APIから受け取る。
  const resolved = resolveBoardUrlForBrowser(threadUrl);
  if (resolved?.type !== "thread") return null;

  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  return `https://www.kyodemo.net/sdemo/b/e_e_${resolved.boardName}/?hi=${encodeURIComponent(
    rawId,
  )}&key=${encodeURIComponent(resolved.threadId)}&date=${dateStr}`;
}

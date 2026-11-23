import { recordDebugEvent } from "src/app/debug/debug-log";

export type ListLoadPage = "historyList" | "writeHistoryList" | "logList";

interface ListLoadDetails {
  reset: boolean;
  rows: number;
  startedAt: number;
}

/**
 * 一覧ページの読み込みにかかった時間を記録する。
 *
 * 変更理由: 一覧の表示が遅いという報告は利用者の画面でしか再現しないことが多い。
 * `pnpm debug:tauri logs --category list-loading` で、取得に何ミリ秒かかったかを確かめられるようにする。
 */
export function recordListLoad(
  page: ListLoadPage,
  { reset, rows, startedAt }: ListLoadDetails,
): void {
  recordDebugEvent(
    "list-loading",
    "一覧の読み込みが完了しました",
    { page, reset, rows, durationMs: Math.round(performance.now() - startedAt) },
    { withStack: false },
  );
}

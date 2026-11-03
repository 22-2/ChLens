import { CHLENS_BUILD_INFO, type ChlensBuildInfo } from "src/app/build-info";
import { buildInfoRows } from "src/app/debug/build-info-rows";
import { formatJstTimestamp } from "src/app/debug/log-persistence";
import { isTauriRuntime } from "src/app/platform/runtime";

/**
 * 不具合報告に添える実行環境の情報。
 *
 * 変更理由: ログだけでは、どの版のどの実行環境で起きたかを報告者に毎回聞き直す必要があった。
 * 版の項目はビルド情報の一覧と同じ行を使い、画面の出どころ（Tauri・拡張機能など）も一緒に残す。
 */
export interface EnvironmentInfo {
  buildInfo: ChlensBuildInfo;
  /** "tauri" か、画面の URL のスキーム（chrome-extension・moz-extension・http など）。 */
  runtime: string;
  language: string;
  userAgent: string;
}

export function collectEnvironmentInfo(): EnvironmentInfo {
  return {
    buildInfo: CHLENS_BUILD_INFO,
    // Tauri の WebView は拡張機能と同じ http 系のスキームを使う環境があるため、先に Tauri を判定する。
    runtime: isTauriRuntime() ? "tauri" : window.location.protocol.replace(/:$/, ""),
    language: navigator.language,
    userAgent: navigator.userAgent,
  };
}

/** 貼り付けたときに読みやすく、報告先でも検索しやすい、項目名つきの1ブロックにする。 */
export function formatEnvironmentInfo(info: EnvironmentInfo, now = Date.now()): string {
  return [
    "--- ChLens 環境情報 ---",
    `出力時刻: ${formatJstTimestamp(now)}`,
    ...buildInfoRows(info.buildInfo).map((row) => `${row.label}: ${row.value}`),
    `実行環境: ${info.runtime}`,
    `言語: ${info.language}`,
    `ユーザーエージェント: ${info.userAgent}`,
    "---",
  ].join("\n");
}

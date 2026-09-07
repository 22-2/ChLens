import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

export const OPEN_URL_COMMAND_ID = "navigation.open-url";

const OPEN_URL_COMMAND_ID_PREFIX = `${OPEN_URL_COMMAND_ID}:`;

/** コマンドパレット入力から開けるURLを取り出す。認識できない入力は null。 */
export function parseOpenUrlInput(value: string): string | null {
  // 変更理由: 前後の空白だけの差で候補が出たり出なかったりすると混乱するため、
  // ナビゲーション側の直入力提案と同じく trim してから判定する。
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // 変更理由: クリック遷移・URLバー直入力と同じ解決に寄せ、
  // パレット独自の正規表現を持たず判定ブレを防ぐ。
  const parsed = parseInternalBrowserPage(trimmed);
  return parsed ? trimmed : null;
}

export function getOpenUrlCommandId(url: string): string {
  // 変更理由: 動的候補にも既存のコマンド実行契約を適用できるよう、
  // 候補固有のURLをIDに保持して選択時へ引き渡す。
  return `${OPEN_URL_COMMAND_ID_PREFIX}${url.trim()}`;
}

export function createOpenUrlCommand(
  baseCommand: ResolvedBrowserCommand,
  url: string,
): ResolvedBrowserCommand {
  const trimmed = url.trim();
  return {
    ...baseCommand,
    id: getOpenUrlCommandId(trimmed),
    label: `このURLを開く`,
    englishLabel: `Open This URL`,
    description: trimmed,
  };
}

export function getOpenUrlFromCommandId(commandId: string): string | null {
  if (!commandId.startsWith(OPEN_URL_COMMAND_ID_PREFIX)) {
    return null;
  }

  return parseOpenUrlInput(commandId.slice(OPEN_URL_COMMAND_ID_PREFIX.length));
}

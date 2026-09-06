import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";

export const RESPONSE_JUMP_COMMAND_ID = "page.jump-to-response";

const RESPONSE_JUMP_COMMAND_ID_PREFIX = `${RESPONSE_JUMP_COMMAND_ID}:`;

export function parseResponseJumpResNum(value: string): number | null {
  // 変更理由: 既存の入力ダイアログと同じ正の安全整数へ正規化し、全角数字や
  // 先頭ゼロを許容しつつ、危険な巨大値をジャンプ要求へ渡さないようにする。
  const normalized = value.normalize("NFKC").trim();
  if (!/^[0-9]+$/.test(normalized)) {
    return null;
  }

  const resNum = Number(normalized);
  return Number.isSafeInteger(resNum) && resNum > 0 ? resNum : null;
}

export function getResponseJumpCommandId(resNum: number): string {
  // 変更理由: 動的候補にも既存のコマンド実行契約を適用できるよう、
  // 候補固有のレス番号をIDに保持して選択時へ引き渡す。
  return `${RESPONSE_JUMP_COMMAND_ID_PREFIX}${resNum}`;
}

export function createResponseJumpCommand(
  baseCommand: ResolvedBrowserCommand,
  resNum: number,
): ResolvedBrowserCommand {
  return {
    ...baseCommand,
    id: getResponseJumpCommandId(resNum),
    label: `レス${resNum}へジャンプ`,
    englishLabel: `Jump to Response ${resNum}`,
    description: `現在のスレッドのレス${resNum}へ直接ジャンプします`,
  };
}

export function getResponseJumpResNumFromCommandId(commandId: string): number | null {
  if (!commandId.startsWith(RESPONSE_JUMP_COMMAND_ID_PREFIX)) {
    return null;
  }

  return parseResponseJumpResNum(commandId.slice(RESPONSE_JUMP_COMMAND_ID_PREFIX.length));
}

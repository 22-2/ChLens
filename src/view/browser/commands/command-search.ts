import fuzzysort from "fuzzysort";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";
import {
  createResponseJumpCommand,
  parseResponseJumpResNum,
  RESPONSE_JUMP_COMMAND_ID,
} from "src/view/browser/commands/response-jump-command";

interface RankedCommand {
  command: ResolvedBrowserCommand;
  fuzzyScore: number;
  rank: number;
  originalIndex: number;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function words(value: string): string[] {
  return normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function everyTermStartsAWord(value: string, terms: readonly string[]): boolean {
  const candidates = words(value);
  return terms.every((term) => candidates.some((candidate) => candidate.startsWith(term)));
}

function directMatchRank(command: ResolvedBrowserCommand, query: string): number {
  const needle = normalize(query);
  const terms = needle.split(/\s+/).filter(Boolean);
  const names = [command.label, command.englishLabel].map(normalize);
  const aliases = [...command.keywords, command.id].map(normalize);

  if (names.some((name) => name === needle)) return 0;
  if (names.some((name) => name.startsWith(needle))) return 1;
  if (names.some((name) => words(name).some((word) => word.startsWith(needle)))) return 2;
  if (terms.length > 1 && everyTermStartsAWord(names.join(" "), terms)) return 3;
  if (names.some((name) => name.includes(needle))) return 4;
  if (
    aliases.some(
      (alias) =>
        alias === needle ||
        alias.startsWith(needle) ||
        alias.includes(needle) ||
        words(alias).some((word) => word.startsWith(needle)),
    )
  ) {
    return 5;
  }
  return 6;
}

function commandSearchText(command: ResolvedBrowserCommand): string {
  return [command.label, command.englishLabel, ...command.keywords, command.id].join(" ");
}

export function filterAndSortBrowserCommands(
  commands: readonly ResolvedBrowserCommand[],
  query: string,
  recentCommandIds: readonly string[],
): ResolvedBrowserCommand[] {
  if (!query.trim()) {
    const recentOrder = new Map(recentCommandIds.map((id, index) => [id, index]));
    return commands
      .map((command, originalIndex) => ({ command, originalIndex }))
      .sort(
        (a, b) =>
          (recentOrder.get(a.command.id) ?? Infinity) -
            (recentOrder.get(b.command.id) ?? Infinity) || a.originalIndex - b.originalIndex,
      )
      .map(({ command }) => command);
  }

  const baseResponseJumpCommand = commands.find(({ id }) => id === RESPONSE_JUMP_COMMAND_ID);
  const responseJumpResNum = baseResponseJumpCommand ? parseResponseJumpResNum(query) : null;
  const responseJumpCommand =
    baseResponseJumpCommand && responseJumpResNum !== null
      ? createResponseJumpCommand(baseResponseJumpCommand, responseJumpResNum)
      : null;

  // 変更理由: 固定コマンドを数字の検索結果だけに任せると入力値をラベルへ
  // 反映できないため、スレッド上の正しい数字入力に限って動的候補を合成する。
  const commandsToSearch = responseJumpCommand ? [responseJumpCommand, ...commands] : commands;
  const originalOrder = new Map(commandsToSearch.map((command, index) => [command.id, index]));
  const ranked: RankedCommand[] = fuzzysort
    .go(query, commandsToSearch, { key: commandSearchText })
    .map((match) => ({
      command: match.obj,
      fuzzyScore: match.score,
      rank: directMatchRank(match.obj, query),
      originalIndex: originalOrder.get(match.obj.id) ?? Infinity,
    }));

  const sorted = ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === 6 ? b.fuzzyScore - a.fuzzyScore : 0) ||
        a.command.label.localeCompare(b.command.label, "ja", {
          sensitivity: "base",
        }) ||
        a.command.englishLabel.localeCompare(b.command.englishLabel, "en", {
          sensitivity: "base",
        }) ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ command }) => command);

  if (!responseJumpCommand) {
    return sorted;
  }

  return [responseJumpCommand, ...sorted.filter(({ id }) => id !== responseJumpCommand.id)];
}

const RECENT_COMMANDS_LIMIT = 20;

// 変更理由: コピー系コマンドの命名を揃えるためIDを改名した。保存済みの履歴が
// 旧IDのまま孤立しないよう、読み込み時に新IDへ読み替える。
const RENAMED_COMMAND_IDS: Readonly<Record<string, string>> = {
  "copy.page-title-url-markdown": "copy.thread-title-url-markdown",
};

export function normalizeRecentCommandIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => RENAMED_COMMAND_IDS[id] ?? id)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, RECENT_COMMANDS_LIMIT);
}

export function addRecentCommandId(
  recentCommandIds: readonly string[],
  commandId: string,
): string[] {
  return [commandId, ...recentCommandIds.filter((id) => id !== commandId)].slice(
    0,
    RECENT_COMMANDS_LIMIT,
  );
}

const RECENT_COMMANDS_LIMIT = 20;

export function normalizeRecentCommandIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is string => typeof id === "string" && id.length > 0)
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

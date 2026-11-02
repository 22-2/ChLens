/** 板設定からレス上限を読み取る。未指定・不正値は推測せず不明として扱う。 */
export function parseBoardResponseLimit(
  settingText: string,
  source: "setting" | "jbbs",
): number | null {
  const key = source === "jbbs" ? "BBS_THREAD_STOP" : "BBS_RES_MAX";
  const line = settingText.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  if (!line) return null;
  const value = line.slice(key.length + 1).trim();
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
}

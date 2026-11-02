/** 板設定からレス上限を読み取る。未指定・不正値は推測せず不明として扱う。 */
export function parseBoardResponseLimit(
  settingText: string,
  source: "setting" | "jbbs",
): number | null {
  const key = source === "jbbs" ? "BBS_THREAD_STOP" : "BBS_RES_MAX";
  // 板名の解析（resolveBoardTitle）と同じく、行頭のキー=値だけを対象にする。
  const value = new RegExp(`^${key}=(.*)$`, "m").exec(settingText)?.[1]?.trim();
  if (value == null) return null;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
}

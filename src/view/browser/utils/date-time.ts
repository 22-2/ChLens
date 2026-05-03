// 変更理由: 履歴系の IndexedDB には number / 文字列 / 旧 `date` フィールドが混在するため、
// new-ui 側で共通の正規化・表示形式を持っておく。
export function normalizeLegacyTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

export function formatCompactDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const pad2 = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

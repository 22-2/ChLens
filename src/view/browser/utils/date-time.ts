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

const relativeTimeFormatter = new Intl.RelativeTimeFormat("ja-JP", { numeric: "auto" });

/** スレ一覧の作成日時と履歴の時刻を同じ相対表示にする。 */
export function formatRelativeTime(
  timestamp: number,
  now = Date.now(),
  { showSeconds = false }: { showSeconds?: boolean } = {},
): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";

  const difference = timestamp - now;
  const absoluteDifference = Math.abs(difference);
  if (absoluteDifference < 60_000) {
    // 経過時間を秒単位で刻む表示では、過去の1秒未満だけを「たった今」にする。
    const seconds = Math.floor(absoluteDifference / 1000);
    if (showSeconds && difference < 0 && seconds >= 1) return `${seconds}秒前`;
    return difference < 0 ? "たった今" : "まもなく";
  }

  let unit: Intl.RelativeTimeFormatUnit;
  let unitMs: number;
  if (absoluteDifference < 3_600_000) {
    unit = "minute";
    unitMs = 60_000;
  } else if (absoluteDifference < 86_400_000) {
    unit = "hour";
    unitMs = 3_600_000;
  } else if (absoluteDifference < 2_592_000_000) {
    unit = "day";
    unitMs = 86_400_000;
  } else if (absoluteDifference < 31_536_000_000) {
    unit = "month";
    unitMs = 2_592_000_000;
  } else {
    unit = "year";
    unitMs = 31_536_000_000;
  }

  return relativeTimeFormatter.format(Math.round(difference / unitMs), unit);
}

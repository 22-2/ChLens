/**
 * 検索構文の `date:` `datetime:` の値を、ミリ秒の範囲へ読む。
 *
 * 書いた精度がそのまま範囲になる（`2026/10` はその月、`2026/10/02` はその日、
 * `2026/10/02 12:30` はその1分）。`~` で始点と終点をつなぐと、始点の範囲の始まりから
 * 終点の範囲の終わりまでになる。どちらかを省くと、その側は上限・下限なし。
 * Date.parse はロケールで解釈が変わるため使わず、表記を明示的に読む。
 */
export interface TimeRange {
  /** 範囲の始まり（含む）。null なら下限なし。 */
  start: number | null;
  /** 範囲の終わり（含まない）。null なら上限なし。 */
  end: number | null;
}

export type QueryDateKind = "date" | "datetime";

const RANGE_SEPARATOR = /[~〜～]/;

type Interval = { start: number; end: number };

function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[／－．：]/g, (mark) => String.fromCharCode(mark.charCodeAt(0) - 0xfee0));
}

/** 「2026年10月2日」を「2026/10/2」へ、「12時30分」を「12:30」へそろえる。 */
function unifyJapaneseNotation(text: string): string {
  return text
    .replace(/(\d)\s*年\s*/g, "$1/")
    .replace(/(\d)\s*月\s*/g, "$1/")
    .replace(/(\d)\s*日/g, "$1")
    .replace(/(\d)\s*時\s*/g, "$1:")
    .replace(/(\d)\s*分\s*/g, "$1:")
    .replace(/(\d)\s*秒/g, "$1")
    .replace(/[/:]+$/, "");
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dayInterval(base: Date, offsetDays: number): Interval {
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays + 1);
  return { start: start.valueOf(), end: end.valueOf() };
}

function parseKeyword(value: string, now: number): Interval | null {
  switch (value.toLowerCase()) {
    case "today":
    case "今日":
      return dayInterval(new Date(now), 0);
    case "yesterday":
    case "昨日":
      return dayInterval(new Date(now), -1);
    default:
      return null;
  }
}

const TIME_SUFFIX = /(?:^|[\sT])(\d{1,2}):(\d{2})(?::(\d{2}))?$/i;
const FULL_DATE = /^(\d{4})(?:[/\-.](\d{1,2})(?:[/\-.](\d{1,2}))?)?$/;
const MONTH_DAY = /^(\d{1,2})[/\-.](\d{1,2})$/;

/** 1つの値（`~` の片側）を範囲にする。読めなければ null。 */
function parseInterval(raw: string, kind: QueryDateKind, now: number): Interval | null {
  const value = unifyJapaneseNotation(toHalfWidth(raw.trim()));
  if (!value) return null;
  const keyword = parseKeyword(value, now);
  if (keyword) return keyword;

  const timeMatch = TIME_SUFFIX.exec(value);
  const dateText = (timeMatch ? value.slice(0, timeMatch.index) : value).trim();
  const hour = timeMatch ? Number(timeMatch[1]) : null;
  const minute = timeMatch ? Number(timeMatch[2]) : null;
  const second = timeMatch?.[3] != null ? Number(timeMatch[3]) : null;
  if (hour !== null && (hour > 23 || (minute ?? 0) > 59 || (second ?? 0) > 59)) return null;

  let year: number;
  let month: number | null = null;
  let day: number | null = null;
  const nowDate = new Date(now);
  if (dateText === "") {
    // 時刻だけの指定は「今日のその時刻」。日付の指定（date:）では使えない。
    if (hour === null || kind === "date") return null;
    year = nowDate.getFullYear();
    month = nowDate.getMonth() + 1;
    day = nowDate.getDate();
  } else {
    const full = FULL_DATE.exec(dateText);
    const monthDay = MONTH_DAY.exec(dateText);
    if (full) {
      year = Number(full[1]);
      month = full[2] != null ? Number(full[2]) : null;
      day = full[3] != null ? Number(full[3]) : null;
    } else if (monthDay) {
      // 年を省いた月日は今年として読む。
      year = nowDate.getFullYear();
      month = Number(monthDay[1]);
      day = Number(monthDay[2]);
    } else {
      return null;
    }
  }
  if (month !== null && (month < 1 || month > 12)) return null;
  if (month !== null && day !== null && !isValidDate(year, month, day)) return null;

  if (month === null) {
    return { start: new Date(year, 0, 1).valueOf(), end: new Date(year + 1, 0, 1).valueOf() };
  }
  if (day === null) {
    return {
      start: new Date(year, month - 1, 1).valueOf(),
      end: new Date(year, month, 1).valueOf(),
    };
  }
  if (hour === null || minute === null) {
    return dayInterval(new Date(year, month - 1, day), 0);
  }
  const start = new Date(year, month - 1, day, hour, minute, second ?? 0).valueOf();
  const unit = second === null ? 60_000 : 1000;
  return { start, end: start + unit };
}

/** 値を範囲へ読む。読めない値、始点も終点もない値は null。 */
export function parseDateRange(
  text: string,
  kind: QueryDateKind,
  now: number = Date.now(),
): TimeRange | null {
  const parts = text.split(RANGE_SEPARATOR);
  if (parts.length > 2) return null;
  if (parts.length === 1) {
    const interval = parseInterval(parts[0], kind, now);
    return interval ? { start: interval.start, end: interval.end } : null;
  }
  const [left, right] = parts.map((part) => part.trim());
  if (!left && !right) return null;
  const start = left ? parseInterval(left, kind, now) : null;
  const end = right ? parseInterval(right, kind, now) : null;
  if ((left && !start) || (right && !end)) return null;
  return { start: start?.start ?? null, end: end?.end ?? null };
}

export function isInTimeRange(timestamp: number, range: TimeRange): boolean {
  return (
    (range.start === null || timestamp >= range.start) &&
    (range.end === null || timestamp < range.end)
  );
}

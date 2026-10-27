import type { IRes } from "src/service-container/interfaces";

const MOMENTUM_BUCKET_COUNT = 30;

export interface MomentumGraphData {
  values: number[];
  maxValue: number;
  latestValue: number;
  rangeLabel: string;
}

export function parseResTimestamp(res: IRes): number | null {
  const source = res.other ?? res.date;
  if (!source) {
    return null;
  }

  const m = source.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/,
  );
  if (!m) {
    return null;
  }

  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const day = Number.parseInt(m[3], 10);
  const hour = Number.parseInt(m[4], 10);
  const minute = Number.parseInt(m[5], 10);
  const second = Number.parseInt(m[6] ?? "0", 10);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, second).valueOf();
}

/** 投稿時刻を読み取れたレスの時刻を昇順で返す。 */
export function collectResTimestamps(responses: readonly IRes[]): number[] {
  return responses
    .map(parseResTimestamp)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
}

/** 最初のレスから現在までの1日あたりのレス数。ステータスバーとサイドパネルで共有する。 */
export function calculateIkioi(responses: readonly IRes[], now = Date.now()): number | null {
  if (responses.length === 0) {
    return null;
  }

  const timestamps = collectResTimestamps(responses);
  if (timestamps.length === 0) {
    return null;
  }

  const firstResAt = timestamps[0];
  const elapsedDays = Math.max((now - firstResAt) / 86_400_000, 1 / 1440);
  return Math.round((responses.length / elapsedDays) * 10) / 10;
}

export function buildMomentumGraphData(
  responses: readonly IRes[],
  now = Date.now(),
): MomentumGraphData | null {
  const timestamps = collectResTimestamps(responses);
  if (timestamps.length === 0) {
    return null;
  }

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const end = Math.max(now, last);
  const spanMs = Math.max(end - first, 60 * 60 * 1000);
  const buckets = Array.from({ length: MOMENTUM_BUCKET_COUNT }, () => 0);

  for (const ts of timestamps) {
    const ratio = Math.min(1, Math.max(0, (ts - first) / spanMs));
    const bucketIndex = Math.min(
      MOMENTUM_BUCKET_COUNT - 1,
      Math.floor(ratio * (MOMENTUM_BUCKET_COUNT - 1)),
    );
    buckets[bucketIndex] += 1;
  }

  const hoursPerBucket = spanMs / MOMENTUM_BUCKET_COUNT / (1000 * 60 * 60);
  const values = buckets.map(
    (count) => Math.round((count / Math.max(hoursPerBucket, 1 / 60)) * 10) / 10,
  );
  const maxValue = Math.max(1, ...values);
  const latestValue = values[values.length - 1] ?? 0;
  const spanHours = spanMs / (1000 * 60 * 60);
  const rangeLabel =
    spanHours >= 48
      ? `開始から${Math.round(spanHours / 24)}日`
      : `開始から${Math.max(1, Math.round(spanHours))}時間`;

  return {
    values,
    maxValue,
    latestValue,
    rangeLabel,
  };
}

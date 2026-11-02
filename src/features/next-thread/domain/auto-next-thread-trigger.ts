export const NEXT_THREAD_TRIGGER_RES_COUNT = 1000;

/**
 * 候補から外す満了スレかを判定する。
 * 上限不明（null/undefined）は従来どおり1000で満了とみなし、満了済みスレを候補へ混ぜない。
 * 自動更新の停止判定は上限不明のとき件数で止めないため、こちらとは扱いを分けている。
 */
export function isThreadFull(resCount: number, responseLimit?: number | null): boolean {
  return resCount >= (responseLimit ?? NEXT_THREAD_TRIGGER_RES_COUNT);
}

export function isNextThreadSearchTriggered(
  responseCount: number,
  expired: boolean,
  responseLimit: number | null = NEXT_THREAD_TRIGGER_RES_COUNT,
): boolean {
  // 満了前にdat落ちするスレもあるため、レス数だけで探索を制限しない。
  // 本文の取得停止と次スレ探索で同じ条件を使い、探索開始前に自動更新がOFFになるのを防ぐ。
  return expired || (responseLimit != null && responseCount >= responseLimit);
}

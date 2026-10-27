import type { IReadState } from "src/service-container/interfaces";

/**
 * 既読位置から未読レス数を数える。スレ一覧とスレプロパティで同じ基準にする。
 * 既読位置がないスレはまだ閲覧していないため数えない（null）。レス数全体を未読にすると、
 * 未閲覧のスレまで未読として扱ってしまう。
 */
export function countUnreadResponses(
  resCount: number,
  readState: Pick<IReadState, "read" | "received"> | null | undefined,
): number | null {
  if (!readState) return null;
  // read_state_updated で受信レス数が先行する場合もあるため、
  // 手元のレス数と既読状態が把握している受信数の大きい方を基準にする。
  return Math.max(Math.max(resCount, readState.received) - readState.read, 0);
}

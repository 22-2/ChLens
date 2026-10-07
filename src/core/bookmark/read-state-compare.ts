/**
 * 既読状態の新旧比較。
 *
 * 変更理由: 以前は jsutil.js にあり、BookmarkEntryList からは暗黙のグローバル
 * `app.util.isNewerReadState` 経由で呼ばれていた。jsutil.js は Board・HTTP・
 * サービスコンテナまで import するため、依存の少ない純粋関数として切り出し、
 * 各モジュールが明示的に import できるようにする。
 */

/**
 * IReadState (offset?: number) と BookmarkEntryList.ReadState (offset?: number | null) の
 * 両方を受け取れるよう、比較に使うフィールドだけの構造的な型で宣言する。
 */
export interface ComparableReadState {
  received: number;
  read: number;
  last: number;
  offset?: number | null;
  date?: number | null;
}

/** b が a より新しい既読状態なら true を返す。 */
export function isNewerReadState(
  a: ComparableReadState | null | undefined,
  b: ComparableReadState | null | undefined,
): boolean {
  if (!b) {
    return false;
  }
  if (!a) {
    return true;
  }

  if (a.received !== b.received) {
    return a.received < b.received;
  }
  if (a.read !== b.read) {
    return a.read < b.read;
  }
  if (a.date && b.date) {
    return a.date < b.date;
  } else if (a.date) {
    return false;
  } else if (b.date) {
    return true;
  }
  if (a.last !== b.last) {
    return true;
  }
  if (a.offset !== b.offset) {
    return true;
  }

  return false;
}

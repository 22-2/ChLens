// 日付文字列の検証を独立させ、ほかのjsutil処理に依存せず既存書式を保つ。
/** UNIXタイムスタンプ（秒）をDateへ変換する。 */
export const stampToDate = (stamp: number): Date => new Date(stamp * 1000);

/** スレッド表示の日時書式をDateへ変換し、不正な値はnullにする。 */
export function stringToDate(string: string): Date | null {
  const date = string.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/,
  );
  let valid = false;
  if (date != null) {
    valid = date[1] != null;
    if (date[2] == null || !(1 <= +date[2] && +date[2] <= 12)) valid = false;
    if (date[3] == null || !(1 <= +date[3] && +date[3] <= 31)) valid = false;
    if (date[4] == null || !(0 <= +date[4] && +date[4] <= 23)) valid = false;
    if (date[5] == null || !(0 <= +date[5] && +date[5] <= 59)) valid = false;
    if (date[6] == null || !(0 <= +date[6] && +date[6] <= 59)) {
      // 秒が省略または範囲外でも、従来どおり0秒として日時を返す。
      date[6] = "0";
    }
  }
  if (valid && date != null) {
    return new Date(+date[1], +date[2] - 1, +date[3], +date[4], +date[5], +date[6]);
  }
  return null;
}

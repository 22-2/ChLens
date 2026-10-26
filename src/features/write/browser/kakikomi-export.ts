import iconv from "iconv-lite";

export interface KakikomiTxtEntry {
  url: string;
  title: string;
  name: string;
  mail: string;
  message: string;
  date: number;
}

const ENTRY_SEPARATOR = "--------------------------------------------";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime()) || timestamp <= 0) {
    return "----/--/-- --:--:--";
  }

  const pad2 = (value: number): string => value.toString().padStart(2, "0");
  const year = date.getFullYear().toString().padStart(4, "0");
  return `${year}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatHeaderValue(value: string): string {
  // ヘッダー値の改行で次のレコードを壊さないよう、改行を空白に置き換える。
  return value.replace(/[\r\n]+/g, " ");
}

function formatEntry(entry: KakikomiTxtEntry): string {
  const message = entry.message.replace(/\r\n|\r|\n/g, "\r\n");
  return [
    ENTRY_SEPARATOR,
    `Date   : ${formatDate(entry.date)}`,
    `Subject: ${formatHeaderValue(entry.title)}`,
    `URL    : ${formatHeaderValue(entry.url)}`,
    `FROM   : ${formatHeaderValue(entry.name)}`,
    `MAIL   : ${formatHeaderValue(entry.mail)}`,
    "",
    message,
    "",
    "",
    "",
  ].join("\r\n");
}

/** Jane形式のkakikomi.txt本文を生成する。 */
export function formatKakikomiTxt(entries: readonly KakikomiTxtEntry[]): string {
  return entries.map(formatEntry).join("");
}

/** kakikomi.txtの互換形式に合わせてShift-JISとCRLFでエンコードする。 */
export function encodeKakikomiTxt(entries: readonly KakikomiTxtEntry[]): Uint8Array {
  return new Uint8Array(iconv.encode(formatKakikomiTxt(entries), "shift_jis"));
}

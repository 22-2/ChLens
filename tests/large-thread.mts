/**
 * 仮想スクロールの検証用に、高さの違うレスを決まった並びで含む大きなスレッドを作る。
 *
 * 乱数を使わずレス番号から本文を決めるため、失敗したときに同じ並びで再現できる。
 * 1行だけのレス、折り返す長文、改行の多いレス、AA風のレス、画像URL、アンカーを混ぜ、
 * 高さの推定がずれやすい要素をまんべんなく含める。
 */
export const LARGE_THREAD_ID = "1000000002";
export const LARGE_THREAD_TITLE = "大きなテストスレッド";

const LONG_SENTENCE =
  "これは折り返しを確かめるための長い文章で、表示領域の幅によって行数が変わるようにしてある。";

function buildMessage(resNum: number, origin: string): string {
  const parts: string[] = [`レス本文マーカー${resNum}`];
  if (resNum % 7 === 0) {
    parts.push(LONG_SENTENCE.repeat(1 + (resNum % 4)));
  }
  if (resNum % 11 === 0) {
    for (let line = 1; line <= 3 + (resNum % 9); line++) parts.push(`改行の多いレスの${line}行目`);
  }
  if (resNum % 13 === 0) {
    parts.push(
      "　　 ∧＿∧",
      "　　（　´∀｀）",
      "　　（　　　　）",
      "　　｜ ｜　|",
      "　　（_＿）＿）",
    );
  }
  if (resNum % 17 === 0) {
    parts.push(`${origin}/img/${resNum}.png`);
  }
  if (resNum > 5 && resNum % 5 === 0) {
    parts.push(`&gt;&gt;${resNum - 3}`);
  }
  if (resNum % 100 === 0) {
    // 描画範囲から十分に離れたレスへのアンカー。仮想化後は飛び先がDOMにない状態から移動する。
    parts.push(`遠いアンカー &gt;&gt;${resNum - 95}`);
  }
  return parts.join(" <br> ");
}

function formatDate(resNum: number): string {
  // 実在の日時と紛れないよう、固定の日付から1レスごとに10秒ずつ進める。
  const seconds = resNum * 10;
  const hh = String(12 + Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `2026/10/02(金) ${hh}:${mm}:${ss}`;
}

export function createLargeThreadPost(resNum: number, origin: string): string {
  const id = `big${String(resNum % 97).padStart(4, "0")}`;
  const title = resNum === 1 ? LARGE_THREAD_TITLE : "";
  return `名無し<>sage<>${formatDate(resNum)} ID:${id}<>${buildMessage(resNum, origin)}<>${title}`;
}

export function createLargeThreadPosts(count: number, origin: string): string[] {
  return Array.from({ length: count }, (_, index) => createLargeThreadPost(index + 1, origin));
}

/** 画像URLのレスへ返す1x1のPNG。サムネイルの枠は固定なので、画像の大きさは問わない。 */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

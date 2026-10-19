import { stripHtml } from "src/core/util/strip-html";
import { normalizeSearchText } from "src/view/browser/utils/search-normalize";

/**
 * スレッド内のページ内検索（Ctrl+F の置き換え）で、一致箇所をレスのデータから探す。
 *
 * ブラウザのページ内検索はDOMにある文字しか探せず、仮想スクロールで描画していないレスを
 * 見つけられない。表示中の並びのデータから探し、見つけたレスへは位置計算でジャンプする。
 * 一致の数え方はレス内の強調表示（highlightSearchMatches）と同じく、正規化した文字列で
 * 重ならない一致を前から数え、「n件目」と画面上の強調がずれないようにする。
 */
export type ThreadFindField = "name" | "id" | "body";

export interface ThreadFindMatch {
  resNum: number;
  field: ThreadFindField;
  /** 同じレスの同じ欄の中で何番目（0始まり）の一致か。 */
  occurrence: number;
}

export interface FindableRes {
  num: number;
  name: string;
  id?: string;
  message: string;
}

export interface ThreadFindIndexEntry {
  resNum: number;
  /** 画面での並び順（名前・ID・本文）の、正規化した各欄の文字列。 */
  fields: ReadonlyArray<readonly [ThreadFindField, string]>;
}

/** 打鍵のたびに全レスを正規化し直さないよう、レスの並びが変わったときだけ作る。 */
export function buildThreadFindIndex(responses: readonly FindableRes[]): ThreadFindIndexEntry[] {
  return responses.map((res) => ({
    resNum: res.num,
    fields: [
      ["name", normalizeSearchText(stripHtml(res.name))],
      ["id", normalizeSearchText(res.id ?? "")],
      ["body", normalizeSearchText(stripHtml(res.message))],
    ],
  }));
}

export function findThreadMatches(
  index: readonly ThreadFindIndexEntry[],
  query: string,
): ThreadFindMatch[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return [];
  const matches: ThreadFindMatch[] = [];
  for (const { resNum, fields } of index) {
    for (const [field, text] of fields) {
      let occurrence = 0;
      for (
        let position = text.indexOf(normalizedQuery);
        position >= 0;
        position = text.indexOf(normalizedQuery, position + normalizedQuery.length)
      ) {
        matches.push({ resNum, field, occurrence });
        occurrence += 1;
      }
    }
  }
  return matches;
}

/** 前後の一致へ移る。端では反対の端へ回る。一致がなければ -1。 */
export function stepMatchIndex(current: number, total: number, direction: 1 | -1): number {
  if (total === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

/**
 * 検索語を入れたときに最初に選ぶ一致。いま見ているレス以降で最初の一致を選び、
 * 読んでいる位置から離れたスレッドの先頭へ飛ばないようにする（なければ先頭の一致）。
 */
export function findStartIndex(matches: readonly ThreadFindMatch[], fromResNum: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.resNum >= fromResNum);
  return index < 0 ? 0 : index;
}

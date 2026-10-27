// 変更理由: 検索フィルタ・ページ内検索・レス内ハイライトで同じ正規化を使い、
// 「ひらがな・カタカナ」「大文字・小文字」「全角・半角」を区別しない判定が、どこでも一致するようにする。
const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_SHIFT = 0x60; // カタカナとひらがなのコードポイント差

/** 直前の文字とまとめて1文字として扱う文字（結合文字と、半角カナの濁点・半濁点）。 */
const COMBINING_PATTERN = /^[\p{M}ﾞﾟ]$/u;

/**
 * 文字列を、正規化の単位（基底の文字と、それに続く結合文字）に分ける。
 *
 * 半角カナの「ｶﾞ」は2文字だが、全角では「ガ」の1文字になる。1文字ずつ正規化すると
 * 「カ」と濁点に分かれて「ガ」と一致しないため、続く濁点・半濁点を前の文字とまとめる。
 */
export function splitSearchUnits(text: string): string[] {
  const units: string[] = [];
  for (const character of text) {
    if (units.length > 0 && COMBINING_PATTERN.test(character)) {
      units[units.length - 1] += character;
    } else {
      units.push(character);
    }
  }
  return units;
}

/** 正規化の単位1つを、比較用の文字列へ変える。結果は1文字とは限らない（「㍻」は「平成」）。 */
export function normalizeSearchUnit(unit: string): string {
  return unit
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/gu, (kana) => {
      const code = kana.charCodeAt(0);
      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCharCode(code - KANA_SHIFT)
        : kana;
    });
}

export function normalizeSearchText(text: string): string {
  return splitSearchUnits(text).map(normalizeSearchUnit).join("");
}

/** 検索対象とクエリを同じ規則で正規化して部分一致を判定する。 */
export function matchesSearchQuery(text: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query.trim());
  return normalizedQuery === "" || normalizeSearchText(text).includes(normalizedQuery);
}

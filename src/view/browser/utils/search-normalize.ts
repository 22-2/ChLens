// 変更理由: 検索フィルタとレス内ハイライトで同じ正規化を使い、
// 「ひらがな・カタカナを区別しない」判定が両方で一致するようにする。
// 1文字ずつ写像するため、文字数（UTF-16の長さ）が変わらず、ハイライトの位置計算を維持できる。
const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_SHIFT = 0x60; // カタカナとひらがなのコードポイント差

export function normalizeSearchCharacter(character: string): string {
  return character.toLowerCase().replace(/[ァ-ヶ]/g, (kana) => {
    const code = kana.charCodeAt(0);
    return code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCharCode(code - KANA_SHIFT)
      : kana;
  });
}

export function normalizeSearchText(text: string): string {
  return Array.from(text, normalizeSearchCharacter).join("");
}

const WIDE_AND_HALF_WIDTH_PATTERN = /[\uff01-\uff5d\uff66-\uff9d]+/gu;
const KATAKANA_PATTERN = /[\u30a1-\u30f3]/gu;

/**
 * NGのcontains判定で使う、UIやruntimeに依存しない文字列正規化。
 *
 * 既存Chlensの検索と同じく、全角／半角・カタカナ／ひらがな・空白・大文字小文字を
 * 揃える必要があるため、browser側の`app.replaceAll`へ依存せず共有層へ移している。
 */
export function normalizeRuleText(value: string): string {
  return value
    .replace(WIDE_AND_HALF_WIDTH_PATTERN, (part) => part.normalize("NFKC"))
    .replace(KATAKANA_PATTERN, (part) => String.fromCharCode(part.charCodeAt(0) - 0x60))
    .replace(/[ \u3000]/gu, "")
    .toLowerCase();
}

const WIDE_AND_HALF_WIDTH_PATTERN = /[\uff01-\uff5d\uff66-\uff9d]+/gu;
const KATAKANA_PATTERN = /[\u30a1-\u30f3]/gu;

/**
 * NGのcontains判定で使う、UIやruntimeに依存しない文字列正規化。
 *
 * 既存Chlensの検索と同じく、全角／半角・カタカナ／ひらがな・空白・大文字小文字を
 * 揃える必要があるため、browser側の`app.replaceAll`へ依存せず共有層へ移している。
 */
// 変更理由: 同じレス本文を、ルールごと・マッチャーごとに何度も正規化していた（1000レスで約160ms）。
// 直近の結果を覚えて、同じ文字列の正規化を省く。長い文字列はメモリを抱えないよう対象外にする。
const NORMALIZE_CACHE_LIMIT = 4000;
const NORMALIZE_CACHE_MAX_LENGTH = 4000;
const normalizeCache = new Map<string, string>();

export function normalizeRuleText(value: string): string {
  const cached = normalizeCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = normalizeRuleTextUncached(value);
  if (value.length <= NORMALIZE_CACHE_MAX_LENGTH) {
    if (normalizeCache.size >= NORMALIZE_CACHE_LIMIT) normalizeCache.clear();
    normalizeCache.set(value, normalized);
  }
  return normalized;
}

function normalizeRuleTextUncached(value: string): string {
  return value
    .replace(WIDE_AND_HALF_WIDTH_PATTERN, (part) => part.normalize("NFKC"))
    .replace(KATAKANA_PATTERN, (part) => String.fromCharCode(part.charCodeAt(0) - 0x60))
    .replace(/[ \u3000]/gu, "")
    .toLowerCase();
}

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

/** 利用者が切り替えられる検索の条件。既定は従来どおり、すべてを区別しない部分一致。 */
export interface SearchOptions {
  /** true なら大文字・小文字を区別する。 */
  caseSensitive: boolean;
  /** true ならひらがな・カタカナを区別する。 */
  kanaSensitive: boolean;
  /** true なら検索語を正規表現として扱う。 */
  regex: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  kanaSensitive: false,
  regex: false,
};

/** 正規化で何を同一視するか。全角・半角（NFKC）は常に同一視する。 */
export interface SearchFold {
  case: boolean;
  kana: boolean;
}

const DEFAULT_FOLD: SearchFold = { case: true, kana: true };

/**
 * 検索条件から、文字列の正規化で同一視するものを決める。
 * 正規表現のときは検索語の意味（`\D` など）を保つため、大文字・小文字は `i` フラグ側で区別する。
 * 索引を先に作る側（ページ内検索）も同じ規則で正規化できるよう公開している。
 */
export function searchFoldOf(options: SearchOptions): SearchFold {
  return { case: !options.caseSensitive && !options.regex, kana: !options.kanaSensitive };
}

/** カタカナをひらがなにそろえる。正規表現の検索語にも、記号を壊さないようこれだけを掛ける。 */
export function foldKatakana(text: string): string {
  return text.replace(/[ァ-ヶ]/gu, (kana) => {
    const code = kana.charCodeAt(0);
    return code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCharCode(code - KANA_SHIFT)
      : kana;
  });
}

/** 正規化の単位1つを、比較用の文字列へ変える。結果は1文字とは限らない（「㍻」は「平成」）。 */
export function normalizeSearchUnit(unit: string, fold: SearchFold = DEFAULT_FOLD): string {
  const normalized = unit.normalize("NFKC");
  const cased = fold.case ? normalized.toLowerCase() : normalized;
  return fold.kana ? foldKatakana(cased) : cased;
}

export function normalizeSearchText(text: string, fold: SearchFold = DEFAULT_FOLD): string {
  return splitSearchUnits(text)
    .map((unit) => normalizeSearchUnit(unit, fold))
    .join("");
}

/** 正規化済みの文字列の中の一致範囲（[start, end)）。 */
export interface SearchMatchRange {
  start: number;
  end: number;
}

/**
 * 検索語を条件に沿って組み立てた判定器。
 * 文字列は先に `normalize` で比較用へ変え、その上で `find` を呼ぶ。索引を先に作っておけるよう
 * 正規化と一致探しを分けている。
 */
export interface SearchMatcher {
  fold: SearchFold;
  normalize: (text: string) => string;
  /** 正規化済みの文字列から、重ならない一致を前から順に返す。 */
  find: (normalized: string) => SearchMatchRange[];
}

export interface CompiledSearch {
  /** 検索語が空のときは null（絞り込まない）。正規表現が不正なときも null。 */
  matcher: SearchMatcher | null;
  /** 正規表現が不正なときの理由。画面の入力欄に不正を示すために使う。 */
  error: string | null;
}

const EMPTY_SEARCH: CompiledSearch = { matcher: null, error: null };

function findLiteral(normalized: string, needle: string): SearchMatchRange[] {
  const ranges: SearchMatchRange[] = [];
  for (
    let start = normalized.indexOf(needle);
    start >= 0;
    start = normalized.indexOf(needle, start + needle.length)
  ) {
    ranges.push({ start, end: start + needle.length });
  }
  return ranges;
}

function findRegex(normalized: string, pattern: RegExp): SearchMatchRange[] {
  const ranges: SearchMatchRange[] = [];
  // 空文字への一致（`a*` など）は強調も件数も意味がないため除く。
  for (const match of normalized.matchAll(pattern)) {
    if (match[0].length > 0) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

/**
 * 検索語を判定器にする。前後の空白の扱いは呼び出し側が決める（従来どおり trim してから渡す）。
 *
 * 正規表現の検索語へは、記号の意味を壊さないようカタカナ→ひらがなだけを掛ける。
 */
export function compileSearch(
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): CompiledSearch {
  if (query === "") return EMPTY_SEARCH;

  if (options.regex) {
    const fold = searchFoldOf(options);
    const source = fold.kana ? foldKatakana(query) : query;
    let pattern: RegExp;
    try {
      pattern = new RegExp(source, options.caseSensitive ? "g" : "gi");
    } catch (error) {
      // 入力の途中は不正な式になりやすい。絞り込みは止めず、画面で不正を示すために理由を返す。
      return { matcher: null, error: error instanceof Error ? error.message : String(error) };
    }
    return {
      matcher: {
        fold,
        normalize: (text) => normalizeSearchText(text, fold),
        find: (normalized) => findRegex(normalized, pattern),
      },
      error: null,
    };
  }

  const fold = searchFoldOf(options);
  const needle = normalizeSearchText(query, fold);
  if (needle === "") return EMPTY_SEARCH;
  return {
    matcher: {
      fold,
      normalize: (text) => normalizeSearchText(text, fold),
      find: (normalized) => findLiteral(normalized, needle),
    },
    error: null,
  };
}

/**
 * 同じ条件の判定器を1つにまとめ、いずれかに一致した範囲を重ならないよう前から返す。
 * 複数の項を1回の強調表示で扱うために使う。正規化の条件は全員同じでなければならない。
 */
export function combineMatchers(matchers: readonly SearchMatcher[]): SearchMatcher | null {
  if (matchers.length === 0) return null;
  if (matchers.length === 1) return matchers[0];
  const [first] = matchers;
  return {
    fold: first.fold,
    normalize: first.normalize,
    find: (normalized) => {
      const ranges = matchers
        .flatMap((matcher) => matcher.find(normalized))
        .sort((a, b) => a.start - b.start || b.end - a.end);
      const merged: SearchMatchRange[] = [];
      let lastEnd = 0;
      for (const range of ranges) {
        if (range.start < lastEnd) continue;
        merged.push(range);
        lastEnd = range.end;
      }
      return merged;
    },
  };
}

/** 判定器が無い（検索語が空・式が不正）ときは絞り込まず、すべて一致とみなす。 */
export function matcherMatches(matcher: SearchMatcher | null, text: string): boolean {
  return matcher === null || matcher.find(matcher.normalize(text)).length > 0;
}

/** 検索対象とクエリを同じ規則で正規化して部分一致を判定する。 */
export function matchesSearchQuery(
  text: string,
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): boolean {
  return matcherMatches(compileSearch(query.trim(), options).matcher, text);
}

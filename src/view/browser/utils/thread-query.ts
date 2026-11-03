import { stripHtml } from "src/core/util/strip-html";
import type { IRes } from "src/service-container/interfaces";
import { isInTimeRange, parseDateRange } from "src/view/browser/utils/query-date";
import { parseResTimestamp } from "src/view/browser/utils/res-timestamp";
import {
  combineMatchers,
  compileSearch,
  normalizeSearchText,
  searchFoldOf,
  type SearchMatcher,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";

/**
 * スレフィルタの検索構文。普通の文字は本文の部分一致で、知らなくても使える。
 *
 * - 空白: AND
 * - `|`: OR。AND より強く結びつく（`a b|c` は「a かつ（b または c）」）
 * - `!`: NOT。語の先頭にだけ付く（`hello!` の `!` は文字のまま）
 * - `"..."`: 空白や記号を含む語をそのまま探す
 * - `id:` `name:` `body:`: ID・名前・本文を探す。修飾が無い語は本文
 * - `date:` `datetime:`: 投稿日時の範囲。`2026/10/02`、`2026/10/01~2026/10/05` のように書く
 *
 * 入力の途中（`!` だけ、`a |`、`id:`、閉じていない `"`）は失敗させず、そこまでで
 * 完成している部分だけを条件にする。
 */
export type ThreadQueryField = "body" | "name" | "id" | "date" | "datetime";
type TextField = "body" | "name" | "id";

export interface QueryTerm {
  readonly kind: "term";
  readonly field: ThreadQueryField;
  readonly text: string;
}
export interface QueryNot {
  readonly kind: "not";
  readonly operand: QueryNode;
}
export interface QueryAnd {
  readonly kind: "and";
  readonly operands: readonly QueryNode[];
}
export interface QueryOr {
  readonly kind: "or";
  readonly operands: readonly QueryNode[];
}
export type QueryNode = QueryTerm | QueryNot | QueryAnd | QueryOr;

type Token =
  | { readonly type: "term"; readonly field: ThreadQueryField; readonly text: string }
  | { readonly type: "space" | "or" | "not" };

// 日本語入力のまま打てるよう、全角の記号も同じ意味で受ける。
const OR_CHARS = new Set(["|", "｜"]);
const NOT_CHARS = new Set(["!", "！"]);
const FIELD_PREFIX = /^(body|name|id|date|datetime)[:：]/i;

function isSpace(char: string): boolean {
  return /\s/.test(char);
}

function readTerm(query: string, start: number): { token: Token; end: number } {
  let field: ThreadQueryField = "body";
  let index = start;
  const prefix = FIELD_PREFIX.exec(query.slice(start));
  if (prefix) {
    field = prefix[1].toLowerCase() as ThreadQueryField;
    index += prefix[0].length;
  }
  let text = "";
  let quoted = false;
  while (index < query.length) {
    const char = query[index];
    if (char === '"') {
      quoted = !quoted;
      index++;
      continue;
    }
    if (!quoted && (isSpace(char) || OR_CHARS.has(char))) break;
    text += char;
    index++;
  }
  return { token: { type: "term", field, text }, end: index };
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < query.length) {
    const char = query[index];
    if (isSpace(char)) {
      while (index < query.length && isSpace(query[index])) index++;
      tokens.push({ type: "space" });
      continue;
    }
    // `!` が NOT になるのは語の先頭だけ。語の途中は readTerm が文字として読む。
    if (OR_CHARS.has(char) || NOT_CHARS.has(char)) {
      tokens.push({ type: OR_CHARS.has(char) ? "or" : "not" });
      index++;
      continue;
    }
    const { token, end } = readTerm(query, index);
    // 値が空の語（入力途中の `id:` など）は、条件に何も足さない。
    if (token.type === "term" && token.text) tokens.push(token);
    index = end;
  }
  return tokens;
}

function combine(kind: "and" | "or", operands: readonly QueryNode[]): QueryNode | undefined {
  const flat = operands.flatMap((operand) =>
    operand.kind === kind ? operand.operands : [operand],
  );
  if (flat.length <= 1) return flat[0];
  return { kind, operands: flat };
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): QueryNode | undefined {
    const operands: QueryNode[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.peek() === undefined) break;
      const start = this.index;
      const operand = this.parseOr();
      if (operand) operands.push(operand);
      // 前に何もない余分な演算子（語の前の `|`）でループが止まらないようにする。
      if (this.index === start) this.index++;
    }
    return combine("and", operands);
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private skipSpaces(): void {
    while (this.peek()?.type === "space") this.index++;
  }

  private parseOr(): QueryNode | undefined {
    const operands: QueryNode[] = [];
    const first = this.parseUnary();
    if (first) operands.push(first);
    for (;;) {
      // `|` の前後の空白は OR の一部として読む（`a | b`）。
      const beforeSpaces = this.index;
      this.skipSpaces();
      if (this.peek()?.type !== "or") {
        this.index = beforeSpaces;
        break;
      }
      this.index++;
      this.skipSpaces();
      const next = this.parseUnary();
      if (next) operands.push(next);
    }
    return combine("or", operands);
  }

  private parseUnary(): QueryNode | undefined {
    const token = this.peek();
    if (token === undefined) return undefined;
    switch (token.type) {
      case "not": {
        this.index++;
        const operand = this.parseUnary();
        return operand ? { kind: "not", operand } : undefined;
      }
      case "term":
        this.index++;
        return { kind: "term", field: token.field, text: token.text };
      default:
        return undefined;
    }
  }
}

export function parseThreadQuery(query: string): QueryNode | undefined {
  return new Parser(tokenize(query)).parse();
}

/**
 * 旧版の「検索対象」セレクト（名前・ID）で保存された検索語を、検索構文に直す。
 * 空白や記号を含んでもそのまま探せるよう、引用符で囲む。本文・すべては既定の本文なので変えない。
 */
export function applyLegacySearchTarget(query: string, target: string | undefined): string {
  const trimmed = query.trim();
  if ((target !== "name" && target !== "id") || trimmed === "") return query;
  return `${target}:"${trimmed.replaceAll('"', "")}"`;
}

export type ThreadQueryTarget = Pick<IRes, "name" | "id" | "message" | "date" | "other">;

export interface ThreadHighlightMatchers {
  body: SearchMatcher | null;
  name: SearchMatcher | null;
  id: SearchMatcher | null;
}

export interface CompiledThreadQuery {
  /** レスが条件を満たすか。条件が無い・読めない間は、すべて満たす。 */
  matches: (res: ThreadQueryTarget) => boolean;
  /** 強調に使う判定器。否定された語は含めず、欄ごとに分ける。 */
  highlight: ThreadHighlightMatchers;
  /** 正規表現や日付が読めないときの理由。入力欄に不正を示すために使う。 */
  error: string | null;
}

/** 1つのレスについて、欄ごとの正規化済み文字列と投稿時刻を、必要になったときだけ作る。 */
class ResContext {
  private readonly normalizedByField = new Map<TextField, string>();
  private timestamp: number | null | undefined;

  constructor(
    private readonly res: ThreadQueryTarget,
    private readonly fold: ReturnType<typeof searchFoldOf>,
  ) {}

  normalized(field: TextField): string {
    let value = this.normalizedByField.get(field);
    if (value === undefined) {
      value = normalizeSearchText(this.rawText(field), this.fold);
      this.normalizedByField.set(field, value);
    }
    return value;
  }

  postedAt(): number | null {
    this.timestamp ??= parseResTimestamp(this.res);
    return this.timestamp;
  }

  private rawText(field: TextField): string {
    switch (field) {
      case "body":
        return stripHtml(this.res.message);
      case "name":
        return stripHtml(this.res.name);
      case "id":
        return this.res.id ?? "";
    }
  }
}

type Predicate = (context: ResContext) => boolean;

const MATCH_ALL = () => true;
const EMPTY_HIGHLIGHT: ThreadHighlightMatchers = { body: null, name: null, id: null };

function emptyResult(error: string | null): CompiledThreadQuery {
  return { matches: MATCH_ALL, highlight: EMPTY_HIGHLIGHT, error };
}

function buildHighlight(positive: Record<TextField, SearchMatcher[]>): ThreadHighlightMatchers {
  return {
    body: combineMatchers(positive.body),
    name: combineMatchers(positive.name),
    id: combineMatchers(positive.id),
  };
}

/** 正規表現のときは構文を解釈せず、入力全体を本文に対する1つのパターンとして扱う。 */
function compileRegexQuery(query: string, options: SearchOptions): CompiledThreadQuery {
  const { matcher, error } = compileSearch(query.trim(), options);
  if (!matcher) return emptyResult(error);
  const fold = searchFoldOf(options);
  return {
    matches: (res) => matcher.find(normalizeSearchText(stripHtml(res.message), fold)).length > 0,
    highlight: { body: matcher, name: null, id: null },
    error: null,
  };
}

/**
 * 検索語を、レスを判定する関数と強調用の判定器へ組み立てる。
 * 読めない語（不正な日付など）は条件から外し、最初の理由を `error` で返す。
 * NOT の中の読めない語を「常に真」にすると全件が消えてしまうため、外す形にしている。
 */
export function compileThreadQuery(
  query: string,
  options: SearchOptions,
  now: number = Date.now(),
): CompiledThreadQuery {
  if (options.regex) return compileRegexQuery(query, options);
  const root = parseThreadQuery(query);
  if (!root) return emptyResult(null);

  const textOptions: SearchOptions = { ...options, regex: false };
  const fold = searchFoldOf(textOptions);
  const positive: Record<TextField, SearchMatcher[]> = { body: [], name: [], id: [] };
  let error: string | null = null;

  const compileTerm = (term: QueryTerm, negated: boolean): Predicate | undefined => {
    if (term.field === "date" || term.field === "datetime") {
      const range = parseDateRange(term.text, term.field, now);
      if (!range) {
        error ??= `日付「${term.text}」を読み取れません（例: 2026/10/02、2026/10/01~2026/10/05）`;
        return undefined;
      }
      return (context) => {
        const postedAt = context.postedAt();
        return postedAt !== null && isInTimeRange(postedAt, range);
      };
    }
    const { matcher } = compileSearch(term.text, textOptions);
    if (!matcher) return undefined;
    if (!negated) positive[term.field].push(matcher);
    const { field } = term;
    return (context) => matcher.find(context.normalized(field)).length > 0;
  };

  const compileNode = (node: QueryNode, negated: boolean): Predicate | undefined => {
    switch (node.kind) {
      case "term":
        return compileTerm(node, negated);
      case "not": {
        const operand = compileNode(node.operand, !negated);
        return operand && ((context) => !operand(context));
      }
      case "and":
      case "or": {
        const operands = node.operands
          .map((operand) => compileNode(operand, negated))
          .filter((operand): operand is Predicate => operand !== undefined);
        if (operands.length === 0) return undefined;
        return node.kind === "and"
          ? (context) => operands.every((operand) => operand(context))
          : (context) => operands.some((operand) => operand(context));
      }
    }
  };

  const predicate = compileNode(root, false);
  if (!predicate) return emptyResult(error);
  return {
    matches: (res) => predicate(new ResContext(res, fold)),
    highlight: buildHighlight(positive),
    error,
  };
}

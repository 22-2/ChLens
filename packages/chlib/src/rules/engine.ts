import { getRuleTargetDefinition } from "./catalog";
import { DEFAULT_IMAGE_SIMILARITY, isSimilarImageHash } from "./image-hash";
import {
  getRuleConditions,
  type Rule,
  type RuleCondition,
  type RuleMatcher,
  type RuleTarget,
} from "./model";
import { normalizeRuleText } from "./normalize";
import { matchesRuleSites } from "./scope";

export interface RuleMatchContext {
  readonly all?: string;
  readonly title?: string;
  readonly body?: string;
  readonly name?: string;
  readonly mail?: string;
  readonly id?: string | null;
  readonly slip?: string | null;
  readonly url: string;
  readonly resCount?: number;
  readonly replyCount?: number;
  readonly anchorCount?: number;
}

export interface RuleMatchResult {
  readonly rule: Rule;
  readonly matcher: RuleMatcher;
  readonly type: string;
  readonly params?: Record<string, string>;
}

export interface ThreadListRuleContext {
  readonly title: string;
  readonly url: string;
  readonly resCount: number;
  readonly all?: string;
}

export type BoardRuleContext = ThreadListRuleContext;

export interface ResponseRuleContext extends RuleMatchContext {
  readonly all: string;
  readonly title: string;
  readonly body: string;
  readonly name: string;
  readonly mail: string;
}

export const BOARD_RULE_ACTIONS = new Set<Rule["action"]>(["hide", "highlight", "collapse"]);
export const BOARD_RULE_TARGETS = new Set<RuleTarget>(["all", "title", "url", "res-count"]);
export const RESPONSE_RULE_ACTIONS = new Set<Rule["action"]>(["hide", "collapse"]);
export const RESPONSE_RULE_TARGETS = new Set<RuleTarget>([
  "all",
  "title",
  "body",
  "name",
  "mail",
  "id",
  "slip",
  "url",
  "reply-count",
  "anchor-count",
]);
/** 類似画像NG。画像の条件に、レスの文字列・数値の条件をANDで足せる。 */
export const IMAGE_RULE_ACTIONS = new Set<Rule["action"]>(["blur"]);
export const IMAGE_RULE_TARGETS = new Set<RuleTarget>([...RESPONSE_RULE_TARGETS, "image"]);

// Boardという呼び方を知らないLive側でも、同じ制限を「thread list」として利用できる。
export const THREAD_LIST_RULE_ACTIONS = BOARD_RULE_ACTIONS;
export const THREAD_LIST_RULE_TARGETS = BOARD_RULE_TARGETS;

const regexCache = new Map<string, RegExp | null>();

function getTargetValue(target: RuleTarget, context: RuleMatchContext): string | number | null {
  const field = getRuleTargetDefinition(target).field;
  if (field === "url") return context.url;
  // 画像は文字列の文脈に含まれず、evaluateImageRulesがハッシュで判定する。
  if (field === "image") return null;
  return context[field] ?? null;
}

function matchesMatcher(
  matcher: RuleMatcher,
  comparison: ReturnType<typeof getRuleTargetDefinition>["comparison"],
  value: string | number | null,
  onRegexError?: (source: string, error: unknown) => void,
): boolean {
  if (value == null) return false;
  if (comparison === "greater-than" || comparison === "greater-than-or-equal") {
    const threshold = Number(matcher.kind === "regex" ? matcher.source : matcher.value);
    return (
      Number.isFinite(threshold) &&
      (comparison === "greater-than" ? Number(value) > threshold : Number(value) >= threshold)
    );
  }
  const text = String(value);
  // ハッシュは文字列の部分一致で比べない（evaluateImageRulesで判定する）。
  if (matcher.kind === "image-hash") return false;
  if (matcher.kind === "contains") {
    return comparison === "url-contains"
      ? text.includes(matcher.value)
      : normalizeRuleText(text).includes(normalizeRuleText(matcher.value));
  }
  const flags = matcher.flags ?? "i";
  const cacheKey = `${flags}\0${matcher.source}`;
  if (!regexCache.has(cacheKey)) {
    try {
      regexCache.set(cacheKey, new RegExp(matcher.source, flags));
    } catch (error) {
      regexCache.set(cacheKey, null);
      onRegexError?.(matcher.source, error);
    }
  }
  const regex = regexCache.get(cacheKey);
  if (!regex) return false;
  regex.lastIndex = 0;
  return regex.test(text);
}

function resultType(rule: Rule, target: RuleTarget, matcher: RuleMatcher): string {
  const definition = getRuleTargetDefinition(target);
  const resultTypes =
    rule.action === "highlight" ? definition.highlightResultTypes : definition.resultTypes;
  return resultTypes?.[matcher.kind === "regex" ? 1 : 0] ?? definition.resultTypes[0];
}

/** 有効期限・有効/無効・適用先が、いまのURLで判定対象になるルールか。 */
function isRuleActive(rule: Rule, url: string, now: number): boolean {
  if (!rule.enabled) return false;
  if (rule.expiresAt != null && now > rule.expiresAt) return false;
  return matchesRuleSites(rule.scope?.sites, url);
}

/**
 * 文字列・数値の条件を1つ判定する。成立すれば結果種別に使うmatcherを包んで返し、しなければnullを返す。
 * 一覧はOR、unlessは一覧全体を否定する。matcherが空の条件はmatcherなしで成立しうるため包んで返す。
 */
function matchTextCondition(
  condition: RuleCondition,
  context: RuleMatchContext,
  onRegexError?: (source: string, error: unknown) => void,
): { readonly matcher: RuleMatcher | undefined } | null {
  const value = getTargetValue(condition.target, context);
  // 値が不明な対象は否定しても成立させない（IDのないレス等を誤って隠さない）。
  if (value == null) return null;
  const definition = getRuleTargetDefinition(condition.target);
  const matchedMatcher = condition.matchers.find((matcher) =>
    matchesMatcher(
      matcher,
      condition.comparison === ">" ? "greater-than" : definition.comparison,
      value,
      onRegexError,
    ),
  );
  // 構文検証を経ないRuleでも、不正な正規表現の失敗をunlessで反転させない。
  const invalidRegex = condition.matchers.some(
    (matcher) =>
      matcher.kind === "regex" &&
      regexCache.get(`${matcher.flags ?? "i"}\0${matcher.source}`) === null,
  );
  if (condition.negate && invalidRegex) return null;
  if (condition.negate ? matchedMatcher != null : matchedMatcher == null) return null;
  return { matcher: matchedMatcher ?? condition.matchers[0] };
}

function toMatchResult(rule: Rule, matcher: RuleMatcher): RuleMatchResult {
  return {
    rule,
    matcher,
    type: resultType(rule, rule.target, matcher),
    ...(rule.presentation
      ? {
          params: {
            ...(rule.presentation.color ? { bgColor: rule.presentation.color } : {}),
            ...(rule.presentation.label ? { label: rule.presentation.label } : {}),
          },
        }
      : {}),
  };
}

export function matchRules(
  rules: readonly Rule[],
  context: RuleMatchContext,
  allowedActions: ReadonlySet<Rule["action"]>,
  allowedTargets: ReadonlySet<RuleTarget>,
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  const now = Date.now();
  for (const rule of rules) {
    if (!allowedActions.has(rule.action) || !allowedTargets.has(rule.target)) continue;
    if (!isRuleActive(rule, context.url, now)) continue;
    const conditions = getRuleConditions(rule);
    if (conditions.some(({ target }) => !allowedTargets.has(target))) continue;

    // when/unless同士はAND。
    let primaryMatcher: RuleMatcher | null = null;
    let matchesAllConditions = true;
    for (const condition of conditions) {
      const matched = matchTextCondition(condition, context, onRegexError);
      if (!matched) {
        matchesAllConditions = false;
        break;
      }
      // 結果種別は主条件（従来のtarget）から決め、数値などの補助条件が
      // highlightの表示種別を上書きしないようにする。
      primaryMatcher ??= matched.matcher ?? null;
    }
    if (!matchesAllConditions || !primaryMatcher) continue;

    return toMatchResult(rule, primaryMatcher);
  }
  return null;
}

/** スレ一覧のタイトル・URL・レス数に対する評価だけを公開する。 */
export function evaluateThreadListRules(
  rules: readonly Rule[],
  context: ThreadListRuleContext,
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  return matchRules(
    rules,
    { ...context, all: context.all ?? context.title },
    THREAD_LIST_RULE_ACTIONS,
    THREAD_LIST_RULE_TARGETS,
    onRegexError,
  );
}

/** 旧Chlensのboardという用語を維持する別名。判定対象はthread listと同一である。 */
export function evaluateBoardRules(
  rules: readonly Rule[],
  context: BoardRuleContext,
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  return evaluateThreadListRules(rules, context, onRegexError);
}

/** レスの本文・投稿者情報・返信情報に対する評価だけを公開する。 */
export function evaluateResponseRules(
  rules: readonly Rule[],
  context: ResponseRuleContext,
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  // 一覧用のcollapseで、スレを開いたときに全レスまで折りたたまない。
  // 本文・IDなどレス固有の条件を含むcollapseだけをレスへ適用する。
  const responseRules = rules.filter(
    (rule) =>
      rule.action !== "collapse" ||
      getRuleConditions(rule).some(({ target }) => !THREAD_LIST_RULE_TARGETS.has(target)),
  );
  return matchRules(
    responseRules,
    context,
    RESPONSE_RULE_ACTIONS,
    RESPONSE_RULE_TARGETS,
    onRegexError,
  );
}

/**
 * 類似画像NG（blur）を、レスの文脈とそのレスの画像のハッシュで判定する。
 *
 * hide・collapseの判定（evaluateResponseRules）は最初に一致した1件だけを返すため、
 * blurを混ぜると隠すルールと取り合いになる。画像の判定はこの関数に分ける。
 * 画像の条件は、どれか1枚が登録したハッシュのどれかに似ていれば成立する。
 */
export function evaluateImageRules(
  rules: readonly Rule[],
  context: ResponseRuleContext,
  imageHashes: readonly string[],
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  if (imageHashes.length === 0) return null;
  const now = Date.now();
  for (const rule of rules) {
    if (!IMAGE_RULE_ACTIONS.has(rule.action) || rule.target !== "image") continue;
    if (!isRuleActive(rule, context.url, now)) continue;
    const conditions = getRuleConditions(rule);
    if (conditions.some(({ target }) => !IMAGE_RULE_TARGETS.has(target))) continue;

    const similarity = rule.similarity ?? DEFAULT_IMAGE_SIMILARITY;
    let imageMatcher: RuleMatcher | null = null;
    let matchesAllConditions = true;
    for (const condition of conditions) {
      if (condition.target === "image") {
        // unless imageは構文検証で拒否する。検証を経ないRuleでも反転させず、不成立として扱う。
        const matched = condition.negate
          ? undefined
          : condition.matchers.find(
              (matcher) =>
                matcher.kind === "image-hash" &&
                imageHashes.some((hash) => isSimilarImageHash(matcher.value, hash, similarity)),
            );
        if (!matched) {
          matchesAllConditions = false;
          break;
        }
        imageMatcher ??= matched;
        continue;
      }
      if (!matchTextCondition(condition, context, onRegexError)) {
        matchesAllConditions = false;
        break;
      }
    }
    if (!matchesAllConditions || !imageMatcher) continue;

    return toMatchResult(rule, imageMatcher);
  }
  return null;
}

export function clearRuleRegexCache(): void {
  regexCache.clear();
}

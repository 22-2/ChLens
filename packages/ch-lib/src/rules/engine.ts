import { getRuleTargetDefinition } from "./catalog";
import { getRuleConditions, type Rule, type RuleMatcher, type RuleTarget } from "./model";
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

export const BOARD_RULE_ACTIONS = new Set<Rule["action"]>(["hide", "highlight", "demote"]);
export const BOARD_RULE_TARGETS = new Set<RuleTarget>(["all", "title", "url", "res-count"]);
export const RESPONSE_RULE_ACTIONS = new Set<Rule["action"]>(["hide"]);
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

// Boardという呼び方を知らないLive側でも、同じ制限を「thread list」として利用できる。
export const THREAD_LIST_RULE_ACTIONS = BOARD_RULE_ACTIONS;
export const THREAD_LIST_RULE_TARGETS = BOARD_RULE_TARGETS;

const regexCache = new Map<string, RegExp | null>();

function getTargetValue(target: RuleTarget, context: RuleMatchContext): string | number | null {
  const field = getRuleTargetDefinition(target).field;
  if (field === "url") return context.url;
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

export function matchRules(
  rules: readonly Rule[],
  context: RuleMatchContext,
  allowedActions: ReadonlySet<Rule["action"]>,
  allowedTargets: ReadonlySet<RuleTarget>,
  onRegexError?: (source: string, error: unknown) => void,
): RuleMatchResult | null {
  const now = Date.now();
  for (const rule of rules) {
    if (!rule.enabled || !allowedActions.has(rule.action) || !allowedTargets.has(rule.target))
      continue;
    if (rule.expiresAt != null && now > rule.expiresAt) continue;
    if (!matchesRuleSites(rule.scope?.sites, context.url)) continue;
    const conditions = getRuleConditions(rule);
    if (conditions.some(({ target }) => !allowedTargets.has(target))) continue;

    // 同じ条件内のmatcherはOR、条件同士はANDとすることで、既存の複数候補を維持しながら
    // 「タイトルに一致し、かつレス数も閾値以上」のような複合ルールを評価できる。
    let primaryMatcher: RuleMatcher | null = null;
    let matchesAllConditions = true;
    for (const condition of conditions) {
      const value = getTargetValue(condition.target, context);
      const definition = getRuleTargetDefinition(condition.target);
      const matchedMatcher = condition.matchers.find((matcher) =>
        matchesMatcher(matcher, definition.comparison, value, onRegexError),
      );
      if (!matchedMatcher) {
        matchesAllConditions = false;
        break;
      }
      // 結果種別は主条件（従来のtarget）から決め、数値などの補助条件が
      // highlightの表示種別を上書きしないようにする。
      primaryMatcher ??= matchedMatcher;
    }
    if (!matchesAllConditions || !primaryMatcher) continue;

    return {
      rule,
      matcher: primaryMatcher,
      type: resultType(rule, rule.target, primaryMatcher),
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
  return matchRules(rules, context, RESPONSE_RULE_ACTIONS, RESPONSE_RULE_TARGETS, onRegexError);
}

export function clearRuleRegexCache(): void {
  regexCache.clear();
}

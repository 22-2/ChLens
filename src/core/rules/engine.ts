import { normalize } from "src/core/jsutil";
import type { Rule, RuleMatcher, RuleTarget } from "src/core/rules/model";
import { matchesRuleSites } from "src/core/rules/scope";

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
}

export interface RuleMatchResult {
  readonly rule: Rule;
  readonly matcher: RuleMatcher;
  readonly type: string;
  readonly params?: Record<string, string>;
}

const RESULT_TARGET_NAMES: Record<RuleTarget, string> = {
  all: "Word",
  title: "Title",
  body: "Body",
  name: "Name",
  mail: "Mail",
  id: "ID",
  slip: "Slip",
  url: "Url",
  "res-count": "ResCount",
  "reply-count": "ReplyCount",
};

const regexCache = new Map<string, RegExp | null>();

function getTargetValue(target: RuleTarget, context: RuleMatchContext): string | number | null {
  switch (target) {
    case "all":
      return context.all ?? "";
    case "title":
      return context.title ?? "";
    case "body":
      return context.body ?? "";
    case "name":
      return context.name ?? "";
    case "mail":
      return context.mail ?? "";
    case "id":
      return context.id ?? null;
    case "slip":
      return context.slip ?? null;
    case "url":
      return context.url;
    case "res-count":
      return context.resCount ?? null;
    case "reply-count":
      return context.replyCount ?? null;
  }
}

function matchesMatcher(
  matcher: RuleMatcher,
  target: RuleTarget,
  value: string | number | null,
  onRegexError?: (source: string, error: unknown) => void,
): boolean {
  if (value == null) return false;
  if (target === "res-count" || target === "reply-count") {
    const threshold = Number(matcher.kind === "regex" ? matcher.source : matcher.value);
    return (
      Number.isFinite(threshold) &&
      (target === "res-count" ? Number(value) > threshold : Number(value) >= threshold)
    );
  }
  const text = String(value);
  if (matcher.kind === "contains") {
    return target === "url"
      ? text.includes(matcher.value)
      : normalize(text).includes(normalize(matcher.value));
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

function resultType(rule: Rule, matcher: RuleMatcher): string {
  if (rule.target === "all" && matcher.kind === "regex") return "RegExp";
  const base = `${rule.action === "highlight" ? "Highlight" : ""}${RESULT_TARGET_NAMES[rule.target]}`;
  return matcher.kind === "regex" ? `RegExp${base}` : base;
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
    const value = getTargetValue(rule.target, context);
    for (const matcher of rule.matchers) {
      if (!matchesMatcher(matcher, rule.target, value, onRegexError)) continue;
      return {
        rule,
        matcher,
        type: resultType(rule, matcher),
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
  }
  return null;
}

export function clearRuleRegexCache(): void {
  regexCache.clear();
}

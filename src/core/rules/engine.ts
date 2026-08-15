import { normalize } from "src/core/jsutil";
import { getRuleTargetDefinition } from "src/core/rules/catalog";
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
  const definition = getRuleTargetDefinition(rule.target);
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
    const value = getTargetValue(rule.target, context);
    const definition = getRuleTargetDefinition(rule.target);
    for (const matcher of rule.matchers) {
      if (!matchesMatcher(matcher, definition.comparison, value, onRegexError)) continue;
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

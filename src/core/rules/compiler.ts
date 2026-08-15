import { NG_HIGHLIGHT_COLOR_PRESETS } from "src/core/ngDsl";
import type { InternalNGElement } from "src/core/NGTypes";
import { getRuleTargetDefinition, RULE_TARGET_DEFINITIONS } from "src/core/rules/catalog";
import type { Rule, RuleMatcher, RuleTarget } from "src/core/rules/model";
import { normalize } from "src/core/jsutil";

function resolveType(rule: Rule, matcher: RuleMatcher): string | null {
  const regex = matcher.kind === "regex";
  if (rule.action === "highlight") {
    const highlightTypes = getRuleTargetDefinition(rule.target).legacyHighlightTypes;
    return highlightTypes?.[regex ? 1 : 0] ?? null;
  }
  // mute/warn は実行側の表示仕様ができるまで構文予約語に留め、誤ってhideとして適用しない。
  if (rule.action !== "hide") return null;
  return getRuleTargetDefinition(rule.target).legacyTypes[regex ? 1 : 0];
}

/** 表面DSLのRuleを、既存判定エンジンが扱う形式へ隔離して変換する互換境界。 */
export function compileRulesToInternal(rules: readonly Rule[]): InternalNGElement[] {
  return rules.flatMap((rule) => {
    if (!rule.enabled) return [];
    return rule.matchers.flatMap((matcher) => {
      const type = resolveType(rule, matcher);
      if (!type) return [];
      const rawValue = matcher.kind === "regex" ? matcher.source : matcher.value;
      const color = rule.presentation?.color;
      const resolvedColor =
        color && color in NG_HIGHLIGHT_COLOR_PRESETS
          ? NG_HIGHLIGHT_COLOR_PRESETS[color as keyof typeof NG_HIGHLIGHT_COLOR_PRESETS]
          : color;
      return [
        {
          type,
          word: matcher.kind === "regex" ? rawValue : normalize(rawValue),
          exception: false,
          ...(rule.scope?.sites?.length
            ? {
                scope: {
                  value:
                    rule.scope.sites.length === 1 ? rule.scope.sites[0] : [...rule.scope.sites],
                },
              }
            : {}),
          ...(resolvedColor || rule.presentation?.label
            ? {
                params: {
                  ...(resolvedColor ? { bgColor: resolvedColor } : {}),
                  ...(rule.presentation?.label ? { label: rule.presentation.label } : {}),
                },
              }
            : {}),
        } satisfies InternalNGElement,
      ];
    });
  });
}

const INTERNAL_TARGETS = new Map<
  string,
  { target: RuleTarget; regex: boolean; action?: "highlight" }
>(
  Object.values(RULE_TARGET_DEFINITIONS).flatMap((definition) => [
    [definition.legacyTypes[0], { target: definition.name, regex: false }] as const,
    [definition.legacyTypes[1], { target: definition.name, regex: true }] as const,
    ...(definition.legacyHighlightTypes
      ? [
          [
            definition.legacyHighlightTypes[0],
            { target: definition.name, regex: false, action: "highlight" },
          ] as const,
          [
            definition.legacyHighlightTypes[1],
            { target: definition.name, regex: true, action: "highlight" },
          ] as const,
        ]
      : []),
  ]),
);

/** 既存のUI操作が追加した内部ルールを、新DSLへ安全に追記するための逆変換。 */
export function convertInternalToRules(elements: readonly InternalNGElement[]): Rule[] {
  return elements.flatMap((element) => {
    const mapping = INTERNAL_TARGETS.get(element.type);
    if (!mapping || element.exception || element.subElements?.length || element.start) return [];
    const sites = element.scope?.value
      ? Array.isArray(element.scope.value)
        ? element.scope.value
        : [element.scope.value]
      : undefined;
    return [
      {
        action: mapping.action ?? "hide",
        target: mapping.target,
        matchers: [
          mapping.regex
            ? { kind: "regex", source: element.word }
            : { kind: "contains", value: element.word },
        ],
        enabled: element.params?.disabled !== "true",
        ...(sites?.length ? { scope: { sites } } : {}),
        ...(element.params?.bgColor || element.params?.label
          ? {
              presentation: {
                ...(element.params.bgColor ? { color: element.params.bgColor } : {}),
                ...(element.params.label ? { label: element.params.label } : {}),
              },
            }
          : {}),
        ...(element.name ? { name: element.name } : {}),
        ...(element.expire ? { expiresAt: element.expire } : {}),
      } satisfies Rule,
    ];
  });
}

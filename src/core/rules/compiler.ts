import { NG_HIGHLIGHT_COLOR_PRESETS } from "src/core/ngDsl";
import type { InternalNGElement } from "src/core/NGTypes";
import { TYPE } from "src/core/NGTypes";
import type { Rule, RuleMatcher, RuleTarget } from "src/core/rules/model";
import { normalize } from "src/core/jsutil";

function resolveType(rule: Rule, matcher: RuleMatcher): string | null {
  const regex = matcher.kind === "regex";
  if (rule.action === "highlight") {
    if (rule.target !== "title") return null;
    return regex ? TYPE.REG_EXP_HIGHLIGHT_TITLE : TYPE.HIGHLIGHT_TITLE;
  }
  // mute/warn は実行側の表示仕様ができるまで構文予約語に留め、誤ってhideとして適用しない。
  if (rule.action !== "hide") return null;
  const types: Record<RuleTarget, readonly [string, string]> = {
    all: [TYPE.WORD, TYPE.REG_EXP],
    title: [TYPE.TITLE, TYPE.REG_EXP_TITLE],
    body: [TYPE.BODY, TYPE.REG_EXP_BODY],
    name: [TYPE.NAME, TYPE.REG_EXP_NAME],
    mail: [TYPE.MAIL, TYPE.REG_EXP_MAIL],
    id: [TYPE.ID, TYPE.REG_EXP_ID],
    slip: [TYPE.SLIP, TYPE.REG_EXP_SLIP],
    url: [TYPE.URL, TYPE.REG_EXP_URL],
    "res-count": [TYPE.RES_COUNT, TYPE.RES_COUNT],
    "reply-count": [TYPE.REPLY_COUNT, TYPE.REPLY_COUNT],
  };
  return types[rule.target][regex ? 1 : 0];
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
>([
  [TYPE.WORD, { target: "all", regex: false }],
  [TYPE.REG_EXP, { target: "all", regex: true }],
  [TYPE.TITLE, { target: "title", regex: false }],
  [TYPE.REG_EXP_TITLE, { target: "title", regex: true }],
  [TYPE.HIGHLIGHT_TITLE, { target: "title", regex: false, action: "highlight" }],
  [TYPE.REG_EXP_HIGHLIGHT_TITLE, { target: "title", regex: true, action: "highlight" }],
  [TYPE.BODY, { target: "body", regex: false }],
  [TYPE.REG_EXP_BODY, { target: "body", regex: true }],
  [TYPE.NAME, { target: "name", regex: false }],
  [TYPE.REG_EXP_NAME, { target: "name", regex: true }],
  [TYPE.MAIL, { target: "mail", regex: false }],
  [TYPE.REG_EXP_MAIL, { target: "mail", regex: true }],
  [TYPE.ID, { target: "id", regex: false }],
  [TYPE.REG_EXP_ID, { target: "id", regex: true }],
  [TYPE.SLIP, { target: "slip", regex: false }],
  [TYPE.REG_EXP_SLIP, { target: "slip", regex: true }],
  [TYPE.URL, { target: "url", regex: false }],
  [TYPE.REG_EXP_URL, { target: "url", regex: true }],
  [TYPE.RES_COUNT, { target: "res-count", regex: false }],
  [TYPE.REPLY_COUNT, { target: "reply-count", regex: false }],
]);

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

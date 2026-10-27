import {
  getRuleTargetDefinition,
  normalizeRuleAction,
  normalizeRuleTarget,
  RULE_ACTION_CATALOG,
} from "./catalog";
import type { DslLine, DslValue } from "./dsl-ast";
import { parse as parseGrammar } from "./dsl-grammar.js";
import {
  IMAGE_RULE_ACTIONS,
  IMAGE_RULE_TARGETS,
  RESPONSE_RULE_ACTIONS,
  RESPONSE_RULE_TARGETS,
  THREAD_LIST_RULE_ACTIONS,
  THREAD_LIST_RULE_TARGETS,
} from "./engine";
import { MAX_IMAGE_SIMILARITY, MIN_IMAGE_SIMILARITY, normalizeImageHash } from "./image-hash";
import { getRuleConditions, type Rule, type RuleCondition, type RuleMatcher } from "./model";

export interface RuleDslDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}
export interface RuleDslParseResult {
  readonly recognized: boolean;
  readonly rules: readonly Rule[];
  readonly diagnostics: readonly RuleDslDiagnostic[];
}
type ContentLine = Exclude<DslLine, { type: "blank" | "comment" }>;
interface ConditionDraft {
  target: RuleCondition["target"];
  negate?: boolean;
  comparison?: ">" | ">=";
  kind: "contains" | "regex" | "image-hash";
  matchers: RuleMatcher[];
  node: ContentLine;
}
interface RuleDraft {
  action: Rule["action"];
  enabled: boolean;
  properties: Set<string>;
  sites: string[];
  color?: string;
  label?: string;
  similarity?: number;
  conditions: ConditionDraft[];
  node: ContentLine;
  indent?: number;
  invalid: boolean;
}

/** 引用符・バックスラッシュ・改行等を逃がし、1行の値として往復できるようにする。 */
export function quoteRuleDslValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
}
function quoted(value: DslValue | null): string | null {
  return value?.kind === "quoted" && !value.rest ? value.value : null;
}

/** 動作だけの見出しを持つwhen/unless形式。旧見出し・トップレベルandは受け付けない。 */
export function parseRuleDsl(source: string): RuleDslParseResult {
  let nodes: DslLine[];
  try {
    nodes = parseGrammar(source.replace(/\r\n?/gu, "\n"));
  } catch (error) {
    console.error("[ruleDsl] NG文法での解析に失敗しました", { error });
    throw error;
  }
  const diagnostics: RuleDslDiagnostic[] = [];
  const rules: Rule[] = [];
  let recognized = false;
  let current: RuleDraft | null = null;
  let list: ConditionDraft | "sites" | null = null;
  let listNode: ContentLine | null = null;
  let listIndent: number | null = null;
  const error = (node: ContentLine, message: string): void => {
    diagnostics.push({ line: node.line, column: node.column, message });
    if (current) current.invalid = true;
  };
  const addMatcher = (
    condition: ConditionDraft,
    value: DslValue | null,
    node: ContentLine,
  ): void => {
    const text = value?.kind === "quoted" ? value.value : null;
    if (text == null) {
      error(node, "条件の文字列は引用符で囲んでください。");
      return;
    }
    if (condition.kind === "image-hash") {
      const hash = value?.kind === "quoted" && !value.rest ? normalizeImageHash(text) : null;
      if (!hash) {
        error(
          node,
          "imageの値は16進16桁の引用文字列にしてください。画像の右クリックメニューから登録できます。",
        );
        return;
      }
      condition.matchers.push({ kind: "image-hash", value: hash });
      return;
    }
    if (condition.kind === "contains") {
      if (value?.kind !== "quoted" || value.rest || !text) {
        error(node, "containsには空でない引用文字列だけを指定してください。");
        return;
      }
      condition.matchers.push({ kind: "contains", value: text });
      return;
    }
    const rest = value?.kind === "quoted" ? value.rest : "";
    const flags = rest ? /^flags=(\S+)$/u.exec(rest)?.[1] : undefined;
    if (rest && !flags) {
      error(node, "正規表現の後ろにはflagsだけを指定できます。");
      return;
    }
    try {
      new RegExp(text, flags ?? "i");
    } catch (cause) {
      error(node, `正規表現またはflagsが不正です: ${String(cause)}`);
      return;
    }
    condition.matchers.push({ kind: "regex", source: text, ...(flags ? { flags } : {}) });
  };
  const closeList = (): void => {
    if (
      list &&
      listNode &&
      (list === "sites" ? current?.sites.length === 0 : list.matchers.length === 0)
    )
      error(listNode, "一覧には1つ以上の値が必要です。");
    list = null;
    listNode = null;
    listIndent = null;
  };
  const finish = (): void => {
    closeList();
    if (!current) return;
    if (current.conditions.length === 0 && !current.invalid)
      error(current.node, "ルールにはwhenまたはunless条件が必要です。");
    // すべての条件を同時に判定できる画面が存在することを保存前に検証する。
    const action = current.action;
    const targets = current.conditions.map((condition) => condition.target);
    const evaluable = [
      { actions: THREAD_LIST_RULE_ACTIONS, targets: THREAD_LIST_RULE_TARGETS },
      { actions: RESPONSE_RULE_ACTIONS, targets: RESPONSE_RULE_TARGETS },
      { actions: IMAGE_RULE_ACTIONS, targets: IMAGE_RULE_TARGETS },
    ].some(
      (scope) => scope.actions.has(action) && targets.every((target) => scope.targets.has(target)),
    );
    const imageCount = targets.filter((target) => target === "image").length;
    // 画像の判定はハッシュの比較で、1つのルールで1つの画像条件だけを扱う。
    // 本文などの条件だけのblurは、既存の語句によるぼかし（image_blur_word）と役割が重なるため受け付けない。
    if (imageCount > 0 && action !== "blur") error(current.node, "imageはblurでのみ使えます。");
    else if (action === "blur" && targets.length > 0 && imageCount !== 1)
      error(current.node, "blurにはwhen image similarを1つだけ指定してください。");
    else if (targets.length > 0 && !evaluable)
      error(current.node, "動作とすべての条件を同じ画面で判定できません。");
    const titleIndex = current.conditions.findIndex((condition) => condition.target === "title");
    const imageIndex = current.conditions.findIndex((condition) => condition.target === "image");
    if (action === "highlight" && titleIndex < 0)
      error(current.node, "highlightにはtitle条件が必要です。");
    if (current.color != null && action !== "highlight")
      error(current.node, "colorはhighlightでのみ指定できます。");
    // blurはDSL上でルールを見分ける手段がlabelしかないため（保存時にコメントは残らない）、labelを許す。
    if (current.label != null && action !== "highlight" && action !== "blur")
      error(current.node, "labelはhighlightとblurでのみ指定できます。");
    if (current.similarity != null && action !== "blur")
      error(current.node, "similarityはblurでのみ指定できます。");
    if (!current.invalid && current.conditions.length > 0) {
      // highlightの結果種別はtitleから、blurはimageから決める。ほかの条件を先に書いても意味を変えない。
      const conditions = [...current.conditions];
      const primaryIndex = action === "highlight" ? titleIndex : action === "blur" ? imageIndex : 0;
      const primary = conditions.splice(primaryIndex, 1)[0];
      const toCondition = (condition: ConditionDraft): RuleCondition => ({
        target: condition.target,
        matchers: condition.matchers,
        ...(condition.negate ? { negate: true } : {}),
        ...(condition.comparison ? { comparison: condition.comparison } : {}),
      });
      rules.push({
        action,
        enabled: current.enabled,
        ...toCondition(primary),
        ...(conditions.length ? { conditions: conditions.map(toCondition) } : {}),
        ...(current.sites.length ? { scope: { sites: current.sites } } : {}),
        ...(current.color != null || current.label != null
          ? {
              presentation: {
                ...(current.color != null ? { color: current.color } : {}),
                ...(current.label != null ? { label: current.label } : {}),
              },
            }
          : {}),
        ...(current.similarity != null ? { similarity: current.similarity } : {}),
      });
    }
    current = null;
  };
  for (const node of nodes) {
    if (node.type === "blank" || node.type === "comment") continue;
    if (node.indent === 0) {
      finish();
      if (node.type !== "ng-header") {
        error(node, "見出しはhide:など動作だけにしてください。旧形式は使用できません。");
        continue;
      }
      recognized = true;
      const action = normalizeRuleAction(node.action);
      if (!action) {
        error(
          node,
          `未対応の動作です: ${node.action}（利用可能な動作: ${RULE_ACTION_CATALOG.map(({ name }) => name).join("、")}）`,
        );
        continue;
      }
      current = {
        action,
        enabled: true,
        properties: new Set(),
        sites: [],
        conditions: [],
        node,
        invalid: false,
      };
      continue;
    }
    if (!current) {
      error(node, "条件・設定・一覧は動作の見出し内に記述してください。");
      continue;
    }
    current.indent ??= node.indent;
    if (node.indent > current.indent) {
      if (!list) {
        error(node, "一覧の見出しがない位置でインデントされています。");
        continue;
      }
      listIndent ??= node.indent;
      if (node.indent !== listIndent || node.type !== "ng-value") {
        error(node, "一覧の値は同じインデントの引用文字列にしてください。");
        continue;
      }
      if (list === "sites") {
        const site = quoted(node.value);
        if (!site) error(node, "sitesの値は空でない引用文字列にしてください。");
        else current.sites.push(site);
      } else addMatcher(list, node.value, node);
      continue;
    }
    closeList();
    if (node.indent !== current.indent) {
      error(node, "ルール内の条件・設定は同じインデントにしてください。");
      continue;
    }
    if (node.type === "ng-condition") {
      const target = normalizeRuleTarget(node.target);
      if (!target) {
        error(node, `未対応の対象です: ${node.target}`);
        continue;
      }
      const definition = getRuleTargetDefinition(target);
      const numeric =
        definition.comparison === "greater-than" ||
        definition.comparison === "greater-than-or-equal";
      const comparison = node.operator === ">" || node.operator === ">=";
      const expected =
        definition.comparison === "similar" ? "similar" : numeric ? "numeric" : "text";
      const actual = node.operator === "similar" ? "similar" : comparison ? "numeric" : "text";
      if (expected !== actual) {
        error(
          node,
          expected === "numeric"
            ? `${target}には数値比較を指定してください。`
            : expected === "similar"
              ? `${target}にはsimilarを指定してください。`
              : `${target}にはcontainsまたはregexを指定してください。`,
        );
        continue;
      }
      // 「似ていない画像だけ」を対象にすると、ほぼすべての画像に当たるため受け付けない。
      if (target === "image" && node.keyword === "unless") {
        error(node, "imageにはunlessを使えません。whenで指定してください。");
        continue;
      }
      const condition: ConditionDraft = {
        target,
        kind:
          node.operator === "regex"
            ? "regex"
            : node.operator === "similar"
              ? "image-hash"
              : "contains",
        matchers: [],
        node,
        ...(node.keyword === "unless" ? { negate: true } : {}),
        ...(node.operator === ">" ? { comparison: ">" as const } : {}),
      };
      current.conditions.push(condition);
      if (comparison) {
        const value = node.value?.kind === "bare" ? node.value.text : "";
        if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)))
          error(node, "比較値は0以上の整数にしてください。");
        else condition.matchers.push({ kind: "contains", value });
      } else if (node.value == null) {
        list = condition;
        listNode = node;
      } else addMatcher(condition, node.value, node);
      continue;
    }
    if (node.type !== "ng-property") {
      error(node, "when/unless条件または設定行を指定してください。");
      continue;
    }
    const key = node.keyword;
    if (!["sites", "color", "label", "disabled", "similarity"].includes(key)) {
      error(node, `未対応の設定です: ${key}`);
      continue;
    }
    if (current.properties.has(key)) {
      error(node, `設定が重複しています: ${key}`);
      continue;
    }
    current.properties.add(key);
    if (key === "sites") {
      if (node.value == null) {
        list = "sites";
        listNode = node;
      } else {
        const site = quoted(node.value);
        if (!site)
          error(
            node,
            "sitesの値は空でない引用文字列にしてください。複数ならsites:の一覧を使います。",
          );
        else current.sites.push(site);
      }
    } else if (key === "disabled") {
      const value = node.value?.kind === "bare" ? node.value.text : "";
      if (value !== "true" && value !== "false")
        error(node, "disabledにはtrueまたはfalseを指定してください。");
      else current.enabled = value === "false";
    } else if (key === "color") {
      const color = quoted(node.value) ?? (node.value?.kind === "bare" ? node.value.text : "");
      if (!/^(?:[A-Za-z]+|#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8})$/iu.test(color))
        error(node, "colorには色名または16進カラーコードを指定してください。");
      else current.color = color;
    } else if (key === "similarity") {
      // 利用者にはハミング距離ではなく一致率で書いてもらう。%は省略でき、保存時は%付きにそろえる。
      const text = node.value?.kind === "bare" ? node.value.text : "";
      const percent = /^(\d+)%?$/u.exec(text)?.[1];
      const similarity = percent == null ? Number.NaN : Number(percent);
      if (!(similarity >= MIN_IMAGE_SIMILARITY && similarity <= MAX_IMAGE_SIMILARITY))
        error(
          node,
          `similarityには${MIN_IMAGE_SIMILARITY}〜${MAX_IMAGE_SIMILARITY}の整数を指定してください（例: similarity 85%）。`,
        );
      else current.similarity = similarity;
    } else {
      const label = quoted(node.value);
      if (label == null) error(node, "labelの文字列は引用符で囲んでください。");
      else current.label = label;
    }
  }
  finish();
  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return { recognized, rules, diagnostics };
}

function formatCondition(condition: RuleCondition): string[] {
  const prefix = `  ${condition.negate ? "unless" : "when"} ${condition.target}`;
  if (getRuleTargetDefinition(condition.target).field.endsWith("Count")) {
    const matcher = condition.matchers[0];
    return [
      `${prefix} ${condition.comparison ?? ">="} ${matcher.kind === "regex" ? matcher.source : matcher.value}`,
    ];
  }
  const matcherKind = condition.matchers[0].kind;
  const kind = matcherKind === "image-hash" ? "similar" : matcherKind;
  const values = condition.matchers.map((matcher) =>
    matcher.kind === "regex"
      ? `${quoteRuleDslValue(matcher.source)}${matcher.flags ? ` flags=${matcher.flags}` : ""}`
      : quoteRuleDslValue(matcher.value),
  );
  return values.length === 1
    ? [`${prefix} ${kind} ${values[0]}`]
    : [`${prefix} ${kind}:`, ...values.map((value) => `    ${value}`)];
}

/** 設定の保存とNG追加では常に同じwhen/unless形式を出力する。 */
export function formatRuleDsl(rules: readonly Rule[]): string {
  return rules
    .map((rule) => {
      const lines = [`${rule.action}:`];
      if (rule.presentation?.color) lines.push(`  color ${rule.presentation.color}`);
      if (rule.presentation?.label != null)
        lines.push(`  label ${quoteRuleDslValue(rule.presentation.label)}`);
      if (rule.similarity != null) lines.push(`  similarity ${rule.similarity}%`);
      const sites = rule.scope?.sites;
      if (sites?.length === 1) lines.push(`  sites ${quoteRuleDslValue(sites[0])}`);
      else if (sites?.length)
        lines.push("  sites:", ...sites.map((site) => `    ${quoteRuleDslValue(site)}`));
      if (!rule.enabled) lines.push("  disabled true");
      lines.push(...getRuleConditions(rule).flatMap(formatCondition));
      return lines.join("\n");
    })
    .join("\n\n");
}

import {
  getRuleTargetDefinition,
  isRuleCombinationSupported,
  normalizeRuleAction,
  normalizeRuleOption,
  normalizeRuleTarget,
  RULE_ACTION_CATALOG,
} from "./catalog";
import type { DslValue } from "./dsl-ast";
import { parse as parseGrammar } from "./dsl-grammar.js";
import {
  getRuleConditions,
  type Rule,
  type RuleCondition,
  type RuleMatcher,
  type RuleTarget,
} from "./model";

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

// 未対応の動作を指摘する際は、入力可能な候補を添えて修正先を示す。
const AVAILABLE_ACTIONS_HINT = RULE_ACTION_CATALOG.map((entry) => entry.name).join("、");
type BlockMatcherKind = "contains" | "regex";
type RuleHeaderMatcherKind = BlockMatcherKind | "comparison";

/**
 * 構文解析はdsl.peggyから生成したパーサーに任せる。
 * 文法は全行を必ずいずれかの行ノードへ一致させるため、通常の入力では例外にならない。
 * それでも例外が出た場合は文法自体の不具合なので、握りつぶさず詳細を残して再送出する。
 */
function parseWithGrammar<T>(run: () => T, input: string, startRule: string): T {
  try {
    return run();
  } catch (error) {
    console.error(`[ruleDsl] 文法での解析に失敗しました (startRule=${startRule})`, {
      input,
      error,
    });
    throw error;
  }
}

/** 単独の値を解釈する。引用符付きなら中身、閉じていない・余分な文字がある場合はnull。 */
function toPlainValue(value: DslValue): string | null {
  switch (value.kind) {
    case "bare":
      return value.text;
    case "quoted":
      return value.rest ? null : value.value;
    case "unclosed":
      return null;
  }
}

function parseDslValue(source: string): string | null {
  return toPlainValue(
    parseWithGrammar(() => parseGrammar(source, { startRule: "Scalar" }), source, "Scalar"),
  );
}

function tokenizeOptions(source: string): string[] {
  return parseWithGrammar(
    () => parseGrammar(source, { startRule: "OptionList" }),
    source,
    "OptionList",
  );
}

function unquote(value: string): string {
  return parseDslValue(value) ?? value.trim();
}

function parseSites(value: string): string[] {
  const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return tokenizeOptions(unwrapped.replace(/,/gu, " ")).map(unquote).filter(Boolean);
}

function getComparisonOperator(target: RuleTarget): ">" | ">=" | null {
  switch (getRuleTargetDefinition(target).comparison) {
    case "greater-than":
      return ">";
    case "greater-than-or-equal":
      return ">=";
    default:
      return null;
  }
}

function parseRegexMatcherValue(
  value: DslValue,
  defaultFlags?: string,
): { matcher: RuleMatcher; valid: true } | { valid: false } {
  if (value.kind !== "quoted") return { valid: false };
  let flags = defaultFlags;
  if (value.rest) {
    const flagsMatch = /^flags=(\S+)$/u.exec(value.rest);
    if (!flagsMatch) return { valid: false };
    flags = flagsMatch[1];
  }
  return {
    valid: true,
    matcher: { kind: "regex", source: value.value, ...(flags ? { flags } : {}) },
  };
}

interface ParsedConditionHeader {
  readonly target: RuleTarget;
  readonly options: ReadonlyMap<string, string>;
  readonly matcherKind: RuleHeaderMatcherKind | null;
  readonly comparisonOperator: ">" | ">=" | null;
  readonly inlineValue: string | null;
  readonly regexFlags?: string;
  readonly hasError: boolean;
}

function parseConditionHeader(
  action: Rule["action"],
  targetToken: string,
  optionsSource: string,
  line: number,
  diagnostics: RuleDslDiagnostic[],
  isAdditionalCondition: boolean,
): ParsedConditionHeader | null {
  const target = normalizeRuleTarget(targetToken);
  if (!target) {
    diagnostics.push({
      line,
      column: 1,
      message: `未対応の対象です: ${targetToken}`,
    });
    return null;
  }

  let headerHasError = false;
  // AND側のtargetは表示種別を決める主条件ではなく成立条件なので、主条件だけにある
  // highlightの表示対象制限をここでは適用しない。
  if (!isAdditionalCondition && !isRuleCombinationSupported(action, target)) {
    headerHasError = true;
    diagnostics.push({
      line,
      column: 1,
      message: `まだ実行できない動作と対象の組み合わせです: ${action} ${target}`,
    });
  }

  const headerTokens = tokenizeOptions(optionsSource);
  const options = new Map<string, string>();
  let parsedMatcherKind: RuleHeaderMatcherKind | null = null;
  let comparisonOperator: ">" | ">=" | null = null;
  let inlineValue: string | null = null;
  let parsedRegexFlags: string | undefined;

  for (let tokenIndex = 0; tokenIndex < headerTokens.length; tokenIndex += 1) {
    const token = headerTokens[tokenIndex].replace(/:$/u, "");
    const normalizedToken = token.toLowerCase();
    if (normalizedToken === "contains" || normalizedToken === "regex") {
      if (parsedMatcherKind != null) {
        headerHasError = true;
        diagnostics.push({
          line,
          column: 1,
          message: "条件種別を複数指定することはできません。",
        });
      } else {
        parsedMatcherKind = normalizedToken;
      }
      continue;
    }
    if (token === ">" || token === ">=") {
      if (parsedMatcherKind != null || comparisonOperator != null) {
        headerHasError = true;
        diagnostics.push({
          line,
          column: 1,
          message: "条件種別を複数指定することはできません。",
        });
        continue;
      }
      parsedMatcherKind = "comparison";
      comparisonOperator = token;
      const valueToken = headerTokens[tokenIndex + 1];
      if (valueToken == null || valueToken.includes("=")) {
        headerHasError = true;
        diagnostics.push({
          line,
          column: 1,
          message: `比較条件の値がありません: ${token}`,
        });
      } else {
        inlineValue = parseDslValue(valueToken);
        if (inlineValue == null) {
          headerHasError = true;
          diagnostics.push({
            line,
            column: 1,
            message: `比較条件の値が不正です: ${valueToken}`,
          });
        }
        tokenIndex += 1;
      }
      continue;
    }

    const assignment = token.indexOf("=");
    if (assignment > 0) {
      const optionName = token.slice(0, assignment);
      const optionValue = unquote(token.slice(assignment + 1));
      if (optionName.toLowerCase() === "flags") {
        parsedRegexFlags = optionValue;
        continue;
      }
      const option = normalizeRuleOption(optionName);
      if (!option) {
        headerHasError = true;
        diagnostics.push({
          line,
          column: 1,
          message: `未対応のオプションです: ${optionName}`,
        });
        continue;
      }
      options.set(option, optionValue);
      continue;
    }

    headerHasError = true;
    diagnostics.push({
      line,
      column: 1,
      message: `不正な条件指定です: ${token}`,
    });
  }

  if (parsedMatcherKind == null) {
    headerHasError = true;
    diagnostics.push({
      line,
      column: 1,
      message: "条件種別または比較演算子が必要です。",
    });
  }

  const definition = getRuleTargetDefinition(target);
  if (parsedMatcherKind === "comparison") {
    const expectedOperator = getComparisonOperator(target);
    if (expectedOperator == null) {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: `${target} は比較条件に対応していません。`,
      });
    } else if (comparisonOperator !== expectedOperator) {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: `${target} の比較演算子は ${expectedOperator} です。`,
      });
    }
    if (inlineValue == null || !Number.isFinite(Number(inlineValue))) {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: `比較条件の値が数値ではありません: ${inlineValue ?? ""}`,
      });
    }
    if (parsedRegexFlags != null) {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: "比較条件に flags は指定できません。",
      });
    }
  } else {
    if (definition.comparison !== "contains" && definition.comparison !== "url-contains") {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: `${target} には比較演算子を指定してください。`,
      });
    }
    if (parsedRegexFlags != null && parsedMatcherKind !== "regex") {
      headerHasError = true;
      diagnostics.push({
        line,
        column: 1,
        message: "flags は regex 条件でのみ指定できます。",
      });
    }
  }

  if (
    isAdditionalCondition &&
    ["sites", "color", "label", "disabled"].some((option) => options.has(option))
  ) {
    headerHasError = true;
    diagnostics.push({
      line,
      column: 1,
      message: "AND条件にはルール全体のオプションを指定できません。",
    });
  }

  return {
    target,
    options,
    matcherKind: parsedMatcherKind,
    comparisonOperator,
    inlineValue,
    ...(parsedRegexFlags ? { regexFlags: parsedRegexFlags } : {}),
    hasError: headerHasError,
  };
}

/** 新仕様のブロックDSLだけを認識する。旧形式は意図的に受け付けない。 */
export function parseRuleDsl(source: string): RuleDslParseResult {
  const normalizedSource = source.replace(/\r\n?/gu, "\n");
  const nodes = parseWithGrammar(
    () => parseGrammar(normalizedSource),
    normalizedSource,
    "Document",
  );
  const rules: Rule[] = [];
  const diagnostics: RuleDslDiagnostic[] = [];
  let recognized = false;
  const unknownTopLevelLines: number[] = [];
  let current: Omit<Rule, "matchers"> | null = null;
  let matchers: RuleMatcher[] = [];
  let matcherKind: RuleHeaderMatcherKind | null = null;
  let regexFlags: string | undefined;
  let currentHasError = false;
  let ruleHasError = false;
  let additionalConditions: RuleCondition[] = [];

  const resetState = (): void => {
    current = null;
    matchers = [];
    matcherKind = null;
    regexFlags = undefined;
    currentHasError = false;
    ruleHasError = false;
    additionalConditions = [];
  };

  const finishCurrentCondition = (line: number): RuleCondition | null => {
    if (!current) return null;
    if (currentHasError) {
      ruleHasError = true;
      return null;
    }
    if (matchers.length === 0) {
      if (current.enabled) {
        diagnostics.push({ line, column: 1, message: "ルールには1つ以上の条件が必要です。" });
      }
      ruleHasError = true;
      return null;
    }
    return { target: current.target, matchers };
  };

  const flush = (line: number): void => {
    if (!current) return;
    const finalCondition = finishCurrentCondition(line);
    const conditions = finalCondition
      ? [...additionalConditions, finalCondition]
      : additionalConditions;
    if (!ruleHasError && conditions.length > 0) {
      const [primaryCondition, ...restConditions] = conditions;
      rules.push({
        ...current,
        target: primaryCondition.target,
        matchers: primaryCondition.matchers,
        ...(restConditions.length > 0 ? { conditions: restConditions } : {}),
      });
    }
    resetState();
  };

  for (const node of nodes) {
    // flush等は旧実装と同じく0始まりの行番号を受け取るため、index・lineの両方を用意する。
    const line = node.line;
    const index = line - 1;
    if (node.type === "blank" || node.type === "comment") continue;

    if (node.type !== "value") {
      if (node.type === "and-header") {
        recognized = true;
        if (!current) {
          diagnostics.push({
            line,
            column: 1,
            message: "AND条件は既存のルールの後に指定してください。",
          });
          continue;
        }

        const currentRule: Omit<Rule, "matchers"> = current;
        const previousCondition = finishCurrentCondition(index);
        if (previousCondition) additionalConditions.push(previousCondition);

        const parsedHeader = parseConditionHeader(
          currentRule.action,
          node.target,
          node.optionsSource,
          line,
          diagnostics,
          true,
        );
        if (!parsedHeader) {
          currentHasError = true;
          continue;
        }
        current = { ...currentRule, target: parsedHeader.target };
        matcherKind = parsedHeader.matcherKind;
        regexFlags = parsedHeader.regexFlags;
        matchers = [];
        currentHasError = parsedHeader.hasError;
        if (!parsedHeader.hasError && parsedHeader.matcherKind === "comparison") {
          if (parsedHeader.inlineValue != null) {
            matchers.push({ kind: "contains", value: parsedHeader.inlineValue });
          }
        }
        continue;
      }

      if (node.type === "invalid-and") {
        recognized = true;
        diagnostics.push({
          line: line,
          column: 1,
          message: "AND条件の見出しが不正です。",
        });
        continue;
      }

      flush(index);
      if (node.type === "unknown") {
        unknownTopLevelLines.push(line);
        continue;
      }
      recognized = true;
      const action = normalizeRuleAction(node.action);
      if (!action) {
        diagnostics.push({
          line: line,
          column: 1,
          // develop側の改善（利用可能な動作ヒント）を維持する。対象の検証はparseConditionHeader側で行うため、ここでは動作のみ判定する。
          message: `未対応の動作です: ${node.action}（利用可能な動作: ${AVAILABLE_ACTIONS_HINT}）`,
        });
        continue;
      }

      const parsedHeader = parseConditionHeader(
        action,
        node.target,
        node.optionsSource,
        line,
        diagnostics,
        false,
      );
      if (!parsedHeader) {
        continue;
      }

      const sitesValue = parsedHeader.options.get("sites");
      const color = parsedHeader.options.get("color");
      const label = parsedHeader.options.get("label");
      current = {
        action,
        target: parsedHeader.target,
        enabled: parsedHeader.options.get("disabled") !== "true",
        ...(sitesValue ? { scope: { sites: parseSites(sitesValue) } } : {}),
        ...(color || label
          ? { presentation: { ...(color ? { color } : {}), ...(label ? { label } : {}) } }
          : {}),
      };
      matcherKind = parsedHeader.matcherKind;
      regexFlags = parsedHeader.regexFlags;
      currentHasError = parsedHeader.hasError;
      matchers = [];
      if (!parsedHeader.hasError && parsedHeader.matcherKind === "comparison") {
        if (parsedHeader.inlineValue != null) {
          matchers.push({ kind: "contains", value: parsedHeader.inlineValue });
        }
      }
      continue;
    }

    if (!current || matcherKind == null || currentHasError) continue;
    if (matcherKind === "comparison") {
      currentHasError = true;
      ruleHasError = true;
      diagnostics.push({
        line: line,
        column: 1,
        message: "比較条件は見出しと同じ行に指定してください。",
      });
      continue;
    }
    if (matcherKind === "regex") {
      const parsed = parseRegexMatcherValue(node.value, regexFlags);
      if (!parsed.valid) {
        currentHasError = true;
        ruleHasError = true;
        diagnostics.push({
          line: line,
          column: 1,
          message: "regex の値は引用符で囲んでください。",
        });
        continue;
      }
      matchers.push(parsed.matcher);
      continue;
    }

    const value = toPlainValue(node.value);
    if (value == null) {
      currentHasError = true;
      ruleHasError = true;
      diagnostics.push({
        line: line,
        column: 1,
        message: "contains の値の引用符が閉じていません。",
      });
      continue;
    }
    matchers.push({ kind: "contains", value });
  }
  flush(nodes.length);
  if (recognized) {
    for (const line of unknownTopLevelLines) {
      diagnostics.push({
        line,
        column: 1,
        message: "不明なルールまたは新構文ではない行です。",
      });
    }
  }
  return { recognized, rules, diagnostics };
}

function quoteDslValue(value: string): string {
  return /^[\p{L}\p{N}._#-]+$/u.test(value) ? value : JSON.stringify(value);
}

/** 正規表現はバックスラッシュを二重化せず、そのまま引用符で囲む。 */
function quoteRegexDslValue(value: string): string {
  const quote = value.includes('"') && !value.includes("'") ? "'" : '"';
  return `${quote}${value.replaceAll(quote, `\\${quote}`)}${quote}`;
}

function formatOptions(rule: Rule): string {
  const options: string[] = [];
  if (rule.presentation?.color) options.push(`color=${quoteDslValue(rule.presentation.color)}`);
  if (rule.presentation?.label) options.push(`label=${quoteDslValue(rule.presentation.label)}`);
  if (rule.scope?.sites?.length) {
    options.push(`sites=[${rule.scope.sites.map(quoteDslValue).join(" ")}]`);
  }
  if (!rule.enabled) options.push("disabled=true");
  return options.length ? ` ${options.join(" ")}` : "";
}

function getMatcherValue(matcher: RuleMatcher): string {
  return matcher.kind === "regex" ? matcher.source : matcher.value;
}

function formatConditionBlocks(
  condition: RuleCondition,
  prefix: string,
  options: string,
): string[] {
  const comparisonOperator = getComparisonOperator(condition.target);
  if (comparisonOperator) {
    return condition.matchers.map(
      (matcher) =>
        `${prefix}${condition.target} ${comparisonOperator} ${quoteDslValue(getMatcherValue(matcher))}${options}:`,
    );
  }

  const groups: Array<{ kind: BlockMatcherKind; matchers: RuleMatcher[] }> = [];
  for (const matcher of condition.matchers) {
    if (matcher.kind !== "contains" && matcher.kind !== "regex") continue;
    const last = groups.at(-1);
    if (last?.kind === matcher.kind) {
      last.matchers.push(matcher);
    } else {
      groups.push({ kind: matcher.kind, matchers: [matcher] });
    }
  }
  if (groups.length === 0) {
    return [`${prefix}${condition.target} contains${options}:`];
  }
  return groups.map(({ kind, matchers }) => {
    const header = `${prefix}${condition.target} ${kind}${options}:`;
    const body = matchers.map((matcher) => {
      if (matcher.kind === "regex") {
        return `  ${quoteRegexDslValue(matcher.source)}${matcher.flags ? ` flags=${matcher.flags}` : ""}`;
      }
      return `  ${quoteDslValue(matcher.value)}`;
    });
    return [header, ...body].join("\n");
  });
}

/** 内部Ruleから新仕様のユーザー向け表記を生成する。 */
export function formatRuleDsl(rules: readonly Rule[]): string {
  return rules
    .map((rule) => {
      const conditions = getRuleConditions(rule);
      const blocks = conditions.flatMap((condition, index) =>
        formatConditionBlocks(
          condition,
          index === 0 ? `${rule.action} ` : "and ",
          index === 0 ? formatOptions(rule) : "",
        ),
      );
      // AND見出しは同じルールの続きなので、別ルールとの区切りとは異なり改行だけで連結する。
      return blocks.join(conditions.length > 1 ? "\n" : "\n\n");
    })
    .join("\n\n");
}

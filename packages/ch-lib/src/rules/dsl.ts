import {
  getRuleTargetDefinition,
  isRuleCombinationSupported,
  normalizeRuleAction,
  normalizeRuleOption,
  normalizeRuleTarget,
} from "./catalog";
import type { Rule, RuleMatcher, RuleTarget } from "./model";

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

const HEADER_PATTERN = /^(\S+)\s+(\S+)(?:\s+([\s\S]*?))?:\s*$/u;
type BlockMatcherKind = "contains" | "regex";
type RuleHeaderMatcherKind = BlockMatcherKind | "comparison";

interface ParsedQuotedValue {
  readonly value: string;
  readonly rest: string;
}

/**
 * DSLの引用符はJSON文字列ではなく、正規表現をそのまま書くための境界にする。
 * そのため、バックスラッシュは保持し、区切り文字を含めたい場合だけ引用符を逃がす。
 */
function parseQuotedValue(source: string): ParsedQuotedValue | null {
  const trimmed = source.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'") return null;

  let value = "";
  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === quote) {
      value += quote;
      index += 1;
      continue;
    }
    if (char === quote) {
      return { value, rest: trimmed.slice(index + 1).trim() };
    }
    value += char;
  }
  return null;
}

function tokenizeOptions(source: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let bracketDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === "\\" && source[index + 1] !== undefined) {
        current += source[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === "[") {
      bracketDepth += 1;
      current += char;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
    } else if (/\s/u.test(char) && bracketDepth === 0) {
      if (current) result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

function parseDslValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') && !trimmed.startsWith("'")) return trimmed;
  const parsed = parseQuotedValue(trimmed);
  return parsed && !parsed.rest ? parsed.value : null;
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
  source: string,
  defaultFlags?: string,
): { matcher: RuleMatcher; valid: true } | { valid: false } {
  const parsed = parseQuotedValue(source);
  if (!parsed) return { valid: false };
  let flags = defaultFlags;
  if (parsed.rest) {
    const flagsMatch = /^flags=(\S+)$/u.exec(parsed.rest);
    if (!flagsMatch) return { valid: false };
    flags = flagsMatch[1];
  }
  return {
    valid: true,
    matcher: { kind: "regex", source: parsed.value, ...(flags ? { flags } : {}) },
  };
}

function resetCurrentState(): {
  current: null;
  matchers: RuleMatcher[];
  matcherKind: null;
  regexFlags: undefined;
  hasError: false;
} {
  return { current: null, matchers: [], matcherKind: null, regexFlags: undefined, hasError: false };
}

/** 新仕様のブロックDSLだけを認識する。旧形式は意図的に受け付けない。 */
export function parseRuleDsl(source: string): RuleDslParseResult {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const rules: Rule[] = [];
  const diagnostics: RuleDslDiagnostic[] = [];
  let recognized = false;
  const unknownTopLevelLines: number[] = [];
  let current: Omit<Rule, "matchers"> | null = null;
  let matchers: RuleMatcher[] = [];
  let matcherKind: RuleHeaderMatcherKind | null = null;
  let regexFlags: string | undefined;
  let currentHasError = false;

  const flush = (line: number) => {
    if (!current) return;
    if (currentHasError) {
      ({
        current,
        matchers,
        matcherKind,
        regexFlags,
        hasError: currentHasError,
      } = resetCurrentState());
      return;
    }
    if (matchers.length === 0 && current.enabled) {
      diagnostics.push({ line, column: 1, message: "ルールには1つ以上の条件が必要です。" });
    } else if (matchers.length > 0) {
      rules.push({ ...current, matchers });
    }
    ({
      current,
      matchers,
      matcherKind,
      regexFlags,
      hasError: currentHasError,
    } = resetCurrentState());
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    // Monacoや貼り付け元によってBOM/ゼロ幅文字がコメント先頭へ混ざることがあるため、
    // 判定前にコメント用の不可視文字だけを取り除く。
    const trimmed = rawLine.replace(/^[\uFEFF\u200B\u200C\u200D]+/u, "").trim();
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    )
      continue;
    const isIndented = /^\s/u.test(rawLine);

    if (!isIndented) {
      flush(index);
      const match = HEADER_PATTERN.exec(trimmed);
      if (!match) {
        unknownTopLevelLines.push(index + 1);
        continue;
      }
      recognized = true;
      const action = normalizeRuleAction(match[1]);
      const target = normalizeRuleTarget(match[2]);
      if (!action || !target) {
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: !action ? `未対応の動作です: ${match[1]}` : `未対応の対象です: ${match[2]}`,
        });
        continue;
      }

      let headerHasError = false;
      if (!isRuleCombinationSupported(action, target)) {
        headerHasError = true;
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: `まだ実行できない動作と対象の組み合わせです: ${action} ${target}`,
        });
      }

      const headerTokens = tokenizeOptions(match[3] ?? "");
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
              line: index + 1,
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
              line: index + 1,
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
              line: index + 1,
              column: 1,
              message: `比較条件の値がありません: ${token}`,
            });
          } else {
            inlineValue = parseDslValue(valueToken);
            if (inlineValue == null) {
              headerHasError = true;
              diagnostics.push({
                line: index + 1,
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
              line: index + 1,
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
          line: index + 1,
          column: 1,
          message: `不正な条件指定です: ${token}`,
        });
      }

      if (parsedMatcherKind == null) {
        headerHasError = true;
        diagnostics.push({
          line: index + 1,
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
            line: index + 1,
            column: 1,
            message: `${target} は比較条件に対応していません。`,
          });
        } else if (comparisonOperator !== expectedOperator) {
          headerHasError = true;
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: `${target} の比較演算子は ${expectedOperator} です。`,
          });
        }
        if (inlineValue == null || !Number.isFinite(Number(inlineValue))) {
          headerHasError = true;
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: `比較条件の値が数値ではありません: ${inlineValue ?? ""}`,
          });
        }
        if (parsedRegexFlags != null) {
          headerHasError = true;
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: "比較条件に flags は指定できません。",
          });
        }
      } else {
        if (definition.comparison !== "contains" && definition.comparison !== "url-contains") {
          headerHasError = true;
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: `${target} には比較演算子を指定してください。`,
          });
        }
        if (parsedRegexFlags != null && parsedMatcherKind !== "regex") {
          headerHasError = true;
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: "flags は regex 条件でのみ指定できます。",
          });
        }
      }

      const sitesValue = options.get("sites");
      const color = options.get("color");
      const label = options.get("label");
      const threshold = options.get("threshold");
      // thresholdは汎用matcherではなく画像ハッシュの距離にだけ意味があるため、対象を限定する。
      if (threshold != null && target !== "similar-image") {
        headerHasError = true;
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: "threshold は similar-image にだけ指定できます。",
        });
      }
      // ハッシュ値は正規表現で検索する値ではないため、containsだけを受け付ける。
      if (target === "similar-image" && parsedMatcherKind === "regex") {
        headerHasError = true;
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: "similar-image の条件は contains で指定してください。",
        });
      }
      current = {
        action,
        target,
        enabled: options.get("disabled") !== "true",
        ...(sitesValue ? { scope: { sites: parseSites(sitesValue) } } : {}),
        ...(color || label
          ? { presentation: { ...(color ? { color } : {}), ...(label ? { label } : {}) } }
          : {}),
        ...(threshold != null ? { parameters: { threshold } } : {}),
      };
      matcherKind = parsedMatcherKind;
      regexFlags = parsedRegexFlags;
      currentHasError = headerHasError;
      if (!headerHasError && parsedMatcherKind === "comparison" && inlineValue != null) {
        matchers.push({ kind: "contains", value: inlineValue });
      }
      continue;
    }

    if (!current || matcherKind == null || currentHasError) continue;
    if (matcherKind === "comparison") {
      currentHasError = true;
      diagnostics.push({
        line: index + 1,
        column: 1,
        message: "比較条件は見出しと同じ行に指定してください。",
      });
      continue;
    }
    if (matcherKind === "regex") {
      const parsed = parseRegexMatcherValue(trimmed, regexFlags);
      if (!parsed.valid) {
        currentHasError = true;
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: "regex の値は引用符で囲んでください。",
        });
        continue;
      }
      matchers.push(parsed.matcher);
      continue;
    }

    const value = parseDslValue(trimmed);
    if (value == null) {
      currentHasError = true;
      diagnostics.push({
        line: index + 1,
        column: 1,
        message: "contains の値の引用符が閉じていません。",
      });
      continue;
    }
    matchers.push({ kind: "contains", value });
  }
  flush(lines.length);
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
  // 対象固有オプションもDSLへ戻せるよう、保存時に安定した順序で出力する。
  for (const [name, value] of Object.entries(rule.parameters ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    options.push(`${name}=${quoteDslValue(value)}`);
  }
  if (rule.scope?.sites?.length) {
    options.push(`sites=[${rule.scope.sites.map(quoteDslValue).join(" ")}]`);
  }
  if (!rule.enabled) options.push("disabled=true");
  return options.length ? ` ${options.join(" ")}` : "";
}

function getMatcherValue(matcher: RuleMatcher): string {
  return matcher.kind === "regex" ? matcher.source : matcher.value;
}

/** 内部Ruleから新仕様のユーザー向け表記を生成する。 */
export function formatRuleDsl(rules: readonly Rule[]): string {
  return rules
    .flatMap((rule) => {
      const comparisonOperator = getComparisonOperator(rule.target);
      if (comparisonOperator) {
        return rule.matchers.map(
          (matcher) =>
            `${rule.action} ${rule.target} ${comparisonOperator} ${quoteDslValue(getMatcherValue(matcher))}${formatOptions(rule)}:`,
        );
      }

      const groups: Array<{ kind: BlockMatcherKind; matchers: RuleMatcher[] }> = [];
      for (const matcher of rule.matchers) {
        if (matcher.kind !== "contains" && matcher.kind !== "regex") continue;
        const last = groups.at(-1);
        if (last?.kind === matcher.kind) {
          last.matchers.push(matcher);
        } else {
          groups.push({ kind: matcher.kind, matchers: [matcher] });
        }
      }
      if (groups.length === 0) {
        return [`${rule.action} ${rule.target} contains${formatOptions(rule)}:`];
      }
      return groups.map(({ kind, matchers }) => {
        const header = `${rule.action} ${rule.target} ${kind}${formatOptions(rule)}:`;
        const body = matchers.map((matcher) => {
          if (matcher.kind === "regex") {
            return `  ${quoteRegexDslValue(matcher.source)}${matcher.flags ? ` flags=${matcher.flags}` : ""}`;
          }
          return `  ${quoteDslValue(matcher.value)}`;
        });
        return [header, ...body].join("\n");
      });
    })
    .join("\n\n");
}

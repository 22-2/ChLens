import type { DslValue } from "../rules/dsl-ast";
import { parse as parseGrammar } from "../rules/dsl-grammar.js";
import { escapeReplacementPattern } from "./engine";
import type { ReplacementCondition, ReplacementRule, ReplacementTargetName } from "./model";

export interface ReplacementDslDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface ReplacementDslParseResult {
  readonly recognized: boolean;
  readonly rules: readonly ReplacementRule[];
  readonly diagnostics: readonly ReplacementDslDiagnostic[];
}

interface RuleBuilder {
  operation: "replace" | "remove";
  target: ReplacementTargetName;
  kind: "literal" | "regex";
  flags?: string;
  firstOnly: boolean;
  line: number;
  values: Map<string, { value: string; line: number; column: number }>;
  conditions: ReplacementCondition[];
}

function quotedValue(value: DslValue): string | null {
  return value.kind === "quoted" && value.rest === "" ? value.value : null;
}

/** 全行を解析して診断をまとめ、エラーがあれば設定全体を適用しない。 */
export function parseReplacementDsl(source: string): ReplacementDslParseResult {
  const diagnostics: ReplacementDslDiagnostic[] = [];
  const rules: ReplacementRule[] = [];
  let recognized = false;
  let current: RuleBuilder | null = null;
  const report = (line: number, column: number, message: string): void => {
    diagnostics.push({ line, column, message });
  };
  const validateRegex = (
    sourceValue: string,
    flags: string,
    line: number,
    column: number,
  ): void => {
    try {
      new RegExp(sourceValue, flags);
    } catch (error) {
      // 入力エラーはUIへ返す診断として扱い、実行時の例外と区別する。
      report(
        line,
        column,
        `正規表現またはフラグが不正です: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const flush = (): void => {
    if (!current) return;
    const { operation, target, kind, flags, firstOnly, line, values, conditions } = current;
    const required = operation === "replace" ? ["from", "to"] : ["equals"];
    for (const key of required) {
      if (!values.has(key)) report(line, 1, `${key} の指定が必要です。`);
    }
    if (operation === "replace") {
      const from = values.get("from");
      const to = values.get("to");
      if (from && to) {
        if (kind === "literal" && from.value === "") {
          report(from.line, from.column, "literal のfromは空文字にできません。");
        }
        const normalizedFlags = flags ?? "g";
        validateRegex(
          kind === "literal" ? escapeReplacementPattern(from.value) : from.value,
          normalizedFlags,
          from.line,
          from.column,
        );
        if (kind === "literal" && !/^(?:g|i|gi|ig)$/u.test(normalizedFlags)) {
          report(line, 1, "literal のflagsは g / i / gi / ig のいずれかです。");
        }
        rules.push({
          operation,
          unit: "text",
          target,
          matcher: { kind, source: from.value, ...(flags !== undefined ? { flags } : {}) },
          replacement: to.value,
          conditions,
        });
      }
    } else {
      const equals = values.get("equals");
      if (equals && target === "body") {
        if (/\r|\n|<br\s*\/?\s*>/iu.test(equals.value)) {
          report(equals.line, equals.column, "equals には論理行の区切りを含められません。");
        }
        rules.push({
          operation,
          unit: "line",
          target,
          matcher: { kind: "literal", source: equals.value },
          conditions,
          ...(firstOnly ? { firstOnly: true } : {}),
        });
      }
    }
    current = null;
  };

  let nodes;
  try {
    nodes = parseGrammar(source.replace(/\r\n?/gu, "\n"), { startRule: "ReplacementDocument" });
  } catch (error) {
    console.error("[replacementDsl] 文法での解析に失敗しました", error);
    throw error;
  }
  for (const node of nodes) {
    if (node.type === "blank" || node.type === "comment") continue;
    if (node.type === "replacement-field" || node.type === "replacement-condition") {
      if (!current) {
        report(node.line, node.column, "置換ルールの見出しが必要です。");
        continue;
      }
      const value = quotedValue(node.value);
      if (value === null) {
        report(
          node.line,
          node.column,
          "値は引用符で囲み、同じ行に余分な指定を含めないでください。",
        );
        continue;
      }
      if (node.type === "replacement-condition") {
        if (node.field !== "url" && node.field !== "title") {
          report(node.line, node.column, `未対応の条件対象です: ${node.field}`);
          continue;
        }
        if (
          node.operator !== "contains" &&
          node.operator !== "equals" &&
          node.operator !== "regex"
        ) {
          report(node.line, node.column, `未対応の条件演算子です: ${node.operator}`);
          continue;
        }
        if (node.operator === "regex") validateRegex(value, "", node.line, node.column);
        current.conditions.push({
          field: node.field,
          operator: node.operator,
          value,
          ...(node.keyword === "unless" ? { negate: true } : {}),
        });
      } else {
        const allowed = current.operation === "replace" ? ["from", "to"] : ["equals"];
        if (!allowed.includes(node.keyword)) {
          report(node.line, node.column, `未対応の指定です: ${node.keyword}`);
        } else if (current.values.has(node.keyword)) {
          report(node.line, node.column, `${node.keyword} を複数指定することはできません。`);
        } else {
          current.values.set(node.keyword, { value, line: node.line, column: node.column });
        }
      }
      continue;
    }

    flush();
    if (node.type !== "header") {
      report(node.line, 1, "不明な置換ルールです。見出しの末尾には : が必要です。");
      continue;
    }
    if (node.action !== "replace" && node.action !== "remove") {
      report(node.line, 1, `未対応の操作です: ${node.action}`);
      continue;
    }
    recognized = true;
    if (!["name", "mail", "date", "body", "all"].includes(node.target)) {
      report(node.line, 1, `未対応の対象です: ${node.target}`);
      continue;
    }
    const tokens = parseGrammar(node.optionsSource, { startRule: "OptionList" });
    let kind: "literal" | "regex" = "literal";
    let flags: string | undefined;
    if (node.action === "remove") {
      if (node.target !== "body") report(node.line, 1, "line 操作の対象は body のみです。");
      if (
        !(tokens.length === 1 && tokens[0] === "line") &&
        !(tokens.length === 2 && tokens[0] === "line" && tokens[1] === "first")
      ) {
        report(node.line, 1, "remove の指定は body line または body line first です。");
      }
    } else {
      let hasKind = false;
      for (const token of tokens) {
        if (token === "literal" || token === "regex") {
          if (hasKind) report(node.line, 1, "方式を複数指定することはできません。");
          kind = token;
          hasKind = true;
        } else if (token.startsWith("flags=")) {
          if (flags !== undefined) report(node.line, 1, "flags を複数指定することはできません。");
          flags = token.slice(6);
          if (!flags) report(node.line, 1, "flags の値が必要です。");
        } else {
          report(node.line, 1, `未対応のオプションです: ${token}`);
        }
      }
    }
    current = {
      operation: node.action,
      target: node.target as ReplacementTargetName,
      kind,
      flags,
      firstOnly: tokens.includes("first"),
      line: node.line,
      values: new Map(),
      conditions: [],
    };
  }
  flush();
  return { recognized, rules: diagnostics.length > 0 ? [] : rules, diagnostics };
}

function quoteValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** 基本形はliteralを省略する。JSONのエスケープ規則とは異なる引用符を用いる。 */
export function formatReplacementDsl(rules: readonly ReplacementRule[]): string {
  return rules
    .map((rule) => {
      const lines =
        rule.operation === "replace"
          ? [
              `replace ${rule.target}${rule.matcher.kind === "regex" ? " regex" : ""}${rule.matcher.flags !== undefined ? ` flags=${rule.matcher.flags}` : ""}:`,
              `  from ${quoteValue(rule.matcher.source)}`,
              `  to ${quoteValue(rule.replacement)}`,
            ]
          : [
              `remove body line${rule.firstOnly ? " first" : ""}:`,
              `  equals ${quoteValue(rule.matcher.source)}`,
            ];
      lines.push(
        ...rule.conditions.map(
          (condition) =>
            `  ${condition.negate ? "unless" : "when"} ${condition.field} ${condition.operator} ${quoteValue(condition.value)}`,
        ),
      );
      return lines.join("\n");
    })
    .join("\n\n");
}

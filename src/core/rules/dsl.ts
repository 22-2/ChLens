import {
  isRuleCombinationSupported,
  normalizeRuleAction,
  normalizeRuleTarget,
} from "src/core/rules/catalog";
import type { Rule, RuleMatcher } from "src/core/rules/model";

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
const REGEX_PATTERN = /^regex\s+(['"])([\s\S]*)\1(?:\s+flags=(\S+))?$/u;

function tokenizeOptions(source: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let bracketDepth = 0;
  for (const char of source) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
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

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSites(value: string): string[] {
  const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return tokenizeOptions(unwrapped.replace(/,/gu, " ")).map(unquote).filter(Boolean);
}

/** 新ブロックDSLだけを認識する。旧DSLの解釈は呼び出し側へ残す。 */
export function parseRuleDsl(source: string): RuleDslParseResult {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const rules: Rule[] = [];
  const diagnostics: RuleDslDiagnostic[] = [];
  let recognized = false;
  const unknownTopLevelLines: number[] = [];
  let current: Omit<Rule, "matchers"> | null = null;
  let matchers: RuleMatcher[] = [];

  const flush = (line: number) => {
    if (!current) return;
    if (matchers.length === 0 && current.enabled) {
      diagnostics.push({ line, column: 1, message: "ルールには1つ以上の条件が必要です。" });
    } else if (matchers.length > 0) {
      rules.push({ ...current, matchers });
    }
    current = null;
    matchers = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
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
      if (!isRuleCombinationSupported(action, target)) {
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: `まだ実行できない動作と対象の組み合わせです: ${action} ${target}`,
        });
      }
      const options = new Map<string, string>();
      for (const token of tokenizeOptions(match[3] ?? "")) {
        const assignment = token.indexOf("=");
        if (assignment < 1) {
          diagnostics.push({
            line: index + 1,
            column: 1,
            message: `不正なオプションです: ${token}`,
          });
          continue;
        }
        options.set(token.slice(0, assignment), unquote(token.slice(assignment + 1)));
      }
      const sitesValue = options.get("sites");
      const color = options.get("color") ?? options.get("bgColor");
      const label = options.get("label");
      current = {
        action,
        target,
        enabled: options.get("disabled") !== "true",
        ...(sitesValue ? { scope: { sites: parseSites(sitesValue) } } : {}),
        ...(color || label
          ? { presentation: { ...(color ? { color } : {}), ...(label ? { label } : {}) } }
          : {}),
      };
      continue;
    }

    if (!current) {
      if (recognized)
        diagnostics.push({
          line: index + 1,
          column: 1,
          message: "条件の前にルール見出しが必要です。",
        });
      continue;
    }
    const regex = REGEX_PATTERN.exec(trimmed);
    if (regex) {
      matchers.push({ kind: "regex", source: regex[2], ...(regex[3] ? { flags: regex[3] } : {}) });
    } else {
      matchers.push({ kind: "contains", value: unquote(trimmed) });
    }
  }
  flush(lines.length);
  if (recognized) {
    for (const line of unknownTopLevelLines) {
      diagnostics.push({
        line,
        column: 1,
        message: "新しいブロックDSLと旧形式は同じ設定内で混在できません。",
      });
    }
  }
  return { recognized, rules, diagnostics };
}

function quoteDslValue(value: string): string {
  return /^[\p{L}\p{N}._#-]+$/u.test(value) ? value : JSON.stringify(value);
}

/** 内部Ruleからユーザー向けの標準表記を生成する。別名のngは出力せずhideへ統一する。 */
export function formatRuleDsl(rules: readonly Rule[]): string {
  return rules
    .map((rule) => {
      const options: string[] = [];
      if (rule.presentation?.color) options.push(`color=${quoteDslValue(rule.presentation.color)}`);
      if (rule.presentation?.label) options.push(`label=${quoteDslValue(rule.presentation.label)}`);
      if (rule.scope?.sites?.length) {
        options.push(`sites=[${rule.scope.sites.map(quoteDslValue).join(" ")}]`);
      }
      if (!rule.enabled) options.push("disabled=true");
      const header = `${rule.action} ${rule.target}${options.length ? ` ${options.join(" ")}` : ""}:`;
      const body = rule.matchers.map((matcher) =>
        matcher.kind === "regex"
          ? `  regex ${JSON.stringify(matcher.source)}${matcher.flags ? ` flags=${matcher.flags}` : ""}`
          : `  ${quoteDslValue(matcher.value)}`,
      );
      return [header, ...body].join("\n");
    })
    .join("\n\n");
}

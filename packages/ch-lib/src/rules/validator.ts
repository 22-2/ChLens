import { parseRuleDsl, type RuleDslDiagnostic, type RuleDslParseResult } from "./dsl";
import type { Rule } from "./model";

export interface RuleDslValidationResult extends RuleDslParseResult {
  readonly valid: boolean;
}

/** parserの結果を保存前の検証契約として明示する。 */
export function validateRuleDsl(source: string): RuleDslValidationResult {
  const parsed = parseRuleDsl(source);
  return {
    ...parsed,
    valid: parsed.diagnostics.length === 0,
  };
}

export class RuleDslValidationError extends Error {
  readonly diagnostics: readonly RuleDslDiagnostic[];

  constructor(diagnostics: readonly RuleDslDiagnostic[]) {
    const details = diagnostics
      .map(({ line, column, message }) => `${line}:${column} ${message}`)
      .join("\n");
    super(`NG設定に構文エラーがあります\n${details}`);
    this.name = "RuleDslValidationError";
    this.diagnostics = diagnostics;
  }
}

/** 構文エラーがない場合だけ、評価器へ渡せるRule配列を返す。 */
export function parseAndValidateRuleDsl(source: string): readonly Rule[] {
  const result = validateRuleDsl(source);
  if (!result.valid) throw new RuleDslValidationError(result.diagnostics);
  return result.rules;
}

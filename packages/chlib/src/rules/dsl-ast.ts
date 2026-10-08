// dsl.peggyが返す構文木の型。生成されたパーサーの戻り値型としても使う。

/** 引用符付き・引用符なし・閉じていない引用符の値。 */
export type DslValue =
  | { readonly kind: "quoted"; readonly value: string; readonly rest: string }
  | { readonly kind: "unclosed" }
  | { readonly kind: "bare"; readonly text: string };

interface DslHeaderTail {
  readonly target: string;
  readonly optionsSource: string;
}

export type DslLine =
  | { readonly type: "blank"; readonly line: number }
  | { readonly type: "comment"; readonly line: number }
  | { readonly type: "invalid-and"; readonly line: number }
  | { readonly type: "unknown"; readonly line: number }
  | { readonly type: "value"; readonly line: number; readonly value: DslValue }
  | ({ readonly type: "and-header"; readonly line: number } & DslHeaderTail)
  | ({ readonly type: "header"; readonly line: number; readonly action: string } & DslHeaderTail);

export type ReplacementDslLine =
  | Exclude<DslLine, { readonly type: "value" }>
  | {
      readonly type: "replacement-field";
      readonly line: number;
      readonly column: number;
      readonly keyword: string;
      readonly value: DslValue;
    }
  | {
      readonly type: "replacement-condition";
      readonly line: number;
      readonly column: number;
      readonly keyword: "when" | "unless";
      readonly field: string;
      readonly operator: string;
      readonly value: DslValue;
    };

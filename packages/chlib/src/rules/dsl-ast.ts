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

type ReplacementHeaderLine =
  | { readonly type: "blank"; readonly line: number }
  | { readonly type: "comment"; readonly line: number }
  | { readonly type: "unknown"; readonly line: number }
  | ({ readonly type: "header"; readonly line: number; readonly action: string } & DslHeaderTail);

export type ReplacementDslLine =
  | ReplacementHeaderLine
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

export type DslLine =
  | { readonly type: "blank"; readonly line: number }
  | { readonly type: "comment"; readonly line: number }
  | (NgLineLocation &
      (
        | { readonly type: "ng-header"; readonly action: string }
        | {
            readonly type: "ng-condition";
            readonly keyword: "when" | "unless";
            readonly target: string;
            readonly operator: "contains" | "regex" | ">" | ">=";
            readonly value: DslValue | null;
          }
        | {
            readonly type: "ng-property";
            readonly keyword: string;
            readonly value: DslValue | null;
          }
        | { readonly type: "ng-value"; readonly value: DslValue }
      ));

interface NgLineLocation {
  readonly line: number;
  readonly column: number;
  readonly indent: number;
}

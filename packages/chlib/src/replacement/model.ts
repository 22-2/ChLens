export type ReplacementTargetName = "name" | "mail" | "date" | "body" | "all";

/** date/bodyは表示加工前のother/messageへ対応する。追加メタデータも保持する。 */
export interface ReplacementTarget {
  name: string;
  mail: string;
  other: string;
  message: string;
}

export interface ReplacementCondition {
  readonly field: "url" | "title";
  readonly operator: "contains" | "equals" | "regex";
  readonly value: string;
  readonly negate?: boolean;
}

export type ReplacementRule = {
  readonly target: ReplacementTargetName;
  readonly conditions: readonly ReplacementCondition[];
} & (
  | {
      readonly operation: "replace";
      readonly unit: "text";
      readonly matcher: {
        readonly kind: "literal" | "regex";
        readonly source: string;
        readonly flags?: string;
      };
      readonly replacement: string;
    }
  | {
      readonly operation: "remove";
      readonly unit: "line";
      readonly target: "body";
      readonly matcher: { readonly kind: "literal"; readonly source: string };
      /** 先頭行だけを判定する。最初に一致した行という意味ではない。 */
      readonly firstOnly?: boolean;
    }
);

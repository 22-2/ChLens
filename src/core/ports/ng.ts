/**
 * NG 判定の結果。core/ng が生成し、thread・board の型から参照される。
 * service-container からは再エクスポートで参照するため、ここが正本になる。
 */
export interface INGResult {
  type: string;
  /**
   * 一致したルールの動作。blurは類似画像NGの判定（evaluateImageRules）だけが返し、
   * 隠す・強調の判定結果には現れないが、ルールの動作の型と揃えるため含める。
   */
  action?: "hide" | "collapse" | "highlight" | "warn" | "blur";
  /** 実際に一致した条件だけを抜き出したDSL。NG理由の表示に使用する。 */
  ruleDescription?: string;
  /** 設定内のルール位置。表示側で同じルールの一致結果をまとめるために使用する。 */
  ruleIndex?: number;
  name?: string;
  params?: Record<string, string>;
  /** NG ルールが一時的に無効化されているかどうか */
  disabled?: boolean;
}

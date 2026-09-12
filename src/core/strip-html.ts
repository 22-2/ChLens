import { decodeCharReference } from "../../packages/ch-lib/src/utils/entities";

/**
 * レス本文から表示用のプレーンテキストを作る純粋な変換。
 *
 * 変更理由: MCPのサービスワーカーはDOMを持たないため、ブラウザUI用の
 * MessageProcessorへ依存すると取得処理全体を背景へ移せない。タグ除去だけは
 * 実行環境に依存しない共有処理として切り出す。
 */
/** HTMLからタグを除去し、レス本文を検索可能な文字列へ変換する。 */
export function stripHtml(html: string): string {
  // <br>を改行へ変換してからタグを除去し、表示時の段落境界を保つ。
  return decodeCharReference(html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, ""));
}

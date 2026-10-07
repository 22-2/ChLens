// 変更理由: content scriptの対象ホスト・URL形式と正規化を画面側へ複製せず、共有ライブラリに委譲する。
export {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "packages/chlib/src/index";

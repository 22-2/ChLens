/**
 * 板URLの正規化とBBSMENUの重複排除はchlibの共有実装を使う。
 *
 * 変更理由: 実装はchlibへ移したが、アプリのテストはこのモジュールを差し替えて
 * 予約済みドメインを掲示板ホストとして扱っている。アプリ側の参照点として再公開だけ残す。
 */
export {
  type BoardUrlNormalizationOptions,
  getBoardUrlKey,
  type NormalizableBBSMenu,
  type NormalizableBoard,
  normalizeBBSMenus,
  normalizeBoardUrl,
} from "packages/chlib/src/index";

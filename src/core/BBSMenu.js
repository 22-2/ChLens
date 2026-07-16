import { BBSMenuModel } from "src/core/BBSMenuModel";

/**
 * BBSMenu ファサード
 * 既存のAPIとの互換性を保ちつつ、内部でBBSMenuModelを使用
 */

// シングルトンインスタンス
const _model = new BBSMenuModel();

/**
 * 変更通知用のCallbacks
 * @deprecated 直接BBSMenuModelのonChangeを使用することを推奨
 */
export const onChange = _model.onChange;

/**
 * 複数のURLから板一覧を取得してマージ
 * 戻り値の型は BBSMenuModel からの推論に任せる
 * (古い `@return {Promise<{menu: Array}>}` 表記は実際の型と食い違い型エラーの原因になっていた)。
 * @param {boolean} [forceReload=false]
 */
export const fetchAll = async function (forceReload = false) {
  const menu = await _model.fetchAll(forceReload);
  return { menu };
};

/**
 * 単一のURLから板一覧を取得
 * @param {string} url
 * @param {boolean} [force=false]
 */
export const fetch = async function (url, force = false) {
  const menu = await _model.fetchOne(url, force);
  return { menu };
};

/**
 * 板一覧を取得（キャッシュまたは通信）
 * @param {boolean} [forceReload=false]
 */
export const get = async function (forceReload = false) {
  return await _model.get(forceReload);
};

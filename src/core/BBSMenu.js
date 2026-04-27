import { BBSMenuModel } from "./BBSMenuModel";

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
 * @method fetchAll
 * @param {Boolean} [forceReload=false]
 * @return {Promise<{menu: Array}>}
 */
export const fetchAll = async function (forceReload = false) {
  const menu = await _model.fetchAll(forceReload);
  return { menu };
};

/**
 * 単一のURLから板一覧を取得
 * @method fetch
 * @param {String} url
 * @param {Boolean} [force=false]
 * @return {Promise<{menu: Array, response?: Object}>}
 */
export const fetch = async function (url, force = false) {
  const menu = await _model.fetchOne(url, force);
  return { menu };
};

/**
 * 板一覧を取得（キャッシュまたは通信）
 * @method get
 * @param {Boolean} [forceReload=false]
 * @return {Promise<Object>}
 */
export const get = async function (forceReload = false) {
  return await _model.get(forceReload);
};

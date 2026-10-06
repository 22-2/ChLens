import { container } from "src/service-container/index";

/**
 * BBSMenu ファサード（window.app.BBSMenu 互換用）
 *
 * 変更理由: 以前はこのモジュールが BBSMenuModel のシングルトンを持ち、
 * BoardTitleSolver や jsutil が直接 import していたため、container.bbsMenu と入口が分かれていた。
 * 板一覧の状態はサービスコンテナの bbsMenu だけが持ち、ここは既存の window.app API を
 * 維持するための委譲だけを残す。新しいコードは container.bbsMenu を使うこと。
 */

/**
 * 変更通知の購読口
 * @deprecated container.bbsMenu.onChange を使用すること
 */
export const onChange = {
  /** @param {(result: import("src/service-container/interfaces").IBBSMenuResult) => void} callback */
  add: (callback) => container.bbsMenu.onChange.add(callback),
  /** @param {(result: import("src/service-container/interfaces").IBBSMenuResult) => void} callback */
  remove: (callback) => container.bbsMenu.onChange.remove(callback),
};

/**
 * 板一覧を取得（キャッシュまたは通信）
 * @param {boolean} [forceReload=false]
 */
export const get = async function (forceReload = false) {
  return await container.bbsMenu.get(forceReload);
};

// ホームの表示名参照は通信を起こさず、取得済みの板一覧だけを使う。
export const getCached = async function () {
  return await container.bbsMenu.getCached();
};

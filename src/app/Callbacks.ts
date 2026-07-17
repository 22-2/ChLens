import { log } from "src/app/Log";
import { deepCopy } from "src/app/Util";

interface CallbacksConfiguration {
  persistent?: boolean;
}

// コールバック引数の型を購読側へ伝えられるよう、引数タプルでジェネリック化する。
// (unknown[] 固定だと、狭い型のコールバックを add する全箇所が
//  strictFunctionTypes の反変性チェックで型エラーになるため)
export default class Callbacks<Args extends unknown[] = unknown[]> {
  private readonly _config: Readonly<CallbacksConfiguration>;
  private readonly _callbackStore = new Set<(...args: Args) => void>();
  private _latestCallArg: Readonly<Args> | null = null;
  wasCalled = false;

  constructor(config: CallbacksConfiguration = {}) {
    this._config = config;
  }

  add(callback: (...args: Args) => void) {
    if (!this._config.persistent && this._latestCallArg) {
      callback(...deepCopy(this._latestCallArg));
    } else {
      this._callbackStore.add(callback);
    }
  }

  remove(callback: (...args: Args) => void) {
    if (this._callbackStore.has(callback)) {
      this._callbackStore.delete(callback);
    } else {
      log(
        "error",
        "app.Callbacks: 存在しないコールバックを削除しようとしました。",
      );
    }
  }

  call(...arg: Args) {
    if (!this._config.persistent && this._latestCallArg) {
      log(
        "error",
        "app.Callbacks: persistentでないCallbacksが複数回callされました。",
      );
      return;
    }

    this.wasCalled = true;
    this._latestCallArg = deepCopy(arg);
    const tmpCallbackStore = new Set(this._callbackStore);

    for (const callback of tmpCallbackStore) {
      if (this._callbackStore.has(callback)) {
        callback(...deepCopy(arg));
      }
    }

    if (!this._config.persistent) {
      this._callbackStore.clear();
    }
  }

  destroy() {
    this._callbackStore.clear();
  }
}

import { log } from "src/app/Log";
import { deepCopy } from "src/app/Util";

interface CallbacksConfiguration {
  persistent?: boolean;
}

export default class Callbacks {
  private readonly _config: Readonly<CallbacksConfiguration>;
  private readonly _callbackStore = new Set<(...args: unknown[]) => void>();
  private _latestCallArg: ReadonlyArray<unknown> | null = null;
  wasCalled = false;

  constructor(config: CallbacksConfiguration = {}) {
    this._config = config;
  }

  add(callback: (...args: unknown[]) => void) {
    if (!this._config.persistent && this._latestCallArg) {
      callback(...deepCopy(this._latestCallArg));
    } else {
      this._callbackStore.add(callback);
    }
  }

  remove(callback: (...args: unknown[]) => void) {
    if (this._callbackStore.has(callback)) {
      this._callbackStore.delete(callback);
    } else {
      log("error", "app.Callbacks: 存在しないコールバックを削除しようとしました。");
    }
  }

  call(...arg: unknown[]) {
    if (!this._config.persistent && this._latestCallArg) {
      log("error", "app.Callbacks: persistentでないCallbacksが複数回callされました。");
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

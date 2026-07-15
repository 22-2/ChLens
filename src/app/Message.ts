import Callbacks from "src/app/Callbacks";
import { defer } from "src/app/Defer";
import { deepCopy } from "src/app/Util";

class Message {
  private static readonly CHANNEL_NAME = "chlens";
  private readonly _listenerStore: Map<string, Callbacks> = new Map();
  private readonly _bc: BroadcastChannel;

  constructor() {
    this._bc = new BroadcastChannel(Message.CHANNEL_NAME);
    this._bc.addEventListener(
      "message",
      ({ data: { type, message } }: { data: { type: string; message: unknown } }) => {
        void this._fire(type, message);
      },
    );
  }

  private async _fire(type: string, message: unknown) {
    const msg = deepCopy(message);

    await defer();
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type).call(msg);
    }
  }

  send(type: string, message: unknown = {}) {
    void this._fire(type, message);
    this._bc.postMessage({ type, message });
  }

  on(type: string, listener: (...args: unknown[]) => void) {
    if (!this._listenerStore.has(type)) {
      this._listenerStore.set(type, new Callbacks({ persistent: true }));
    }
    this._listenerStore.get(type)!.add(listener);
  }

  off(type: string, listener: (...args: unknown[]) => void) {
    if (this._listenerStore.has(type)) {
      this._listenerStore.get(type).remove(listener);
    }
  }
}

export default new Message();

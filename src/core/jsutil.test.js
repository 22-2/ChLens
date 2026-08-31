import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ChURL } from "packages/ch-lib/src/url/ChURL";

const requestState = vi.hoisted(() => ({
  urls: [],
}));

vi.mock("src/core/HTTP.ts", () => {
  class Request {
    constructor(_method, url) {
      requestState.urls.push(url);
    }

    async send() {
      throw new Error("stop-test-request");
    }
  }

  return { Request };
});

describe("chServerMoveDetect", () => {
  beforeEach(() => {
    requestState.urls = [];

    globalThis.browser = {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {},
          clear: async () => {},
        },
        onChanged: {
          addListener: () => {},
        },
      },
      runtime: {
        id: "dummy",
        sendMessage: async () => {},
        onMessage: { addListener: () => {} },
      },
      tabs: {
        getCurrent: async () => ({ id: 1 }),
      },
      declarativeNetRequest: {
        getSessionRules: (cb) => cb([]),
        updateSessionRules: async () => {},
      },
    };

    globalThis.chrome = { runtime: { id: "dummy" } };

    globalThis.indexedDB = {
      open: () => {
        const req = {};
        queueMicrotask(() => {
          req.onsuccess?.({
            target: {
              result: {
                createObjectStore: () => ({ createIndex: () => {} }),
              },
            },
          });
        });
        return req;
      },
    };

    globalThis.BroadcastChannel = class {
      addEventListener() {}
      on() {}
      postMessage() {}
      close() {}
    };

    globalThis.$__ = () => ({
      innerHTML: "",
      textContent: "",
    });

    globalThis.app = {
      message: { send: vi.fn() },
      replaceAll: (str, before, after) => str.split(before).join(after),
    };
  });

  // 全体並列実行時はlegacy jsutilの動的importが他テストのtransformと重なり、
  // URL判定そのものが5秒を超えることがあるため、既定timeoutだけを延長する。
  it("uses board href when ChURL is passed", async () => {
    const { chServerMoveDetect } = await import("src/core/jsutil.js");

    const threadUrl = new ChURL("https://headline.5ch.io/test/read.cgi/bbynamazu/1000000007/");
    const boardUrl = threadUrl.toBoard();

    await expect(chServerMoveDetect(boardUrl)).rejects.toThrow("stop-test-request");

    // ChURLでもundefinedではなく実URLで通信することを保証し、
    // /view/undefined への誤リクエスト回帰を防ぐ。
    expect(requestState.urls[0]).toBe("http://headline.5ch.io/bbynamazu/");
    expect(requestState.urls[0]).not.toBeUndefined();
  }, 15_000);
});

import { beforeEach, describe, expect, it } from "vitest";
import { ChURL } from "packages/ch-lib/src/url/ChURL";

describe("Thread.parse (headline.5ch.io)", () => {
  beforeEach(() => {
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
      on() {}
      postMessage() {}
      close() {}
    };

    globalThis.$__ = () => ({
      innerHTML: "",
      textContent: "",
    });

    globalThis.app = {
      replaceAll: (str, before, after) => str.split(before).join(after),
      message: { send: () => {} },
    };
  });

  it("parses dat response regardless of format_2chnet setting", async () => {
    const { default: Thread } = await import("src/core/Thread.js");

    const url = new ChURL(
      "https://headline.5ch.io/test/read.cgi/bbynamazu/1000000009/",
    );

    const datText =
      "名無しさん<>sage<>2026/05/01(金) 00:00:00.00 ID:abc<>本文<>スレタイ\n";

    // headline.5ch.ioはread.cgiではなくdat中心のため、
    // 設定がhtml寄りでもdatを正しく解釈できる必要がある。
    const parsed = Thread.parse(url, datText, 0);

    expect(parsed).not.toBeNull();
    expect(parsed.title).toBe("スレタイ");
    expect(parsed.res).toHaveLength(1);
    expect(parsed.res[0].message).toBe("本文");
  });
});

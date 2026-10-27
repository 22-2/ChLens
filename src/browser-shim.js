import {
  getStore2All,
  getStore2String,
  removeStore2Value,
  setStore2String,
} from "src/app/Store2Storage";

// Tauri環境ではbrowser拡張機能APIが存在しないため、
// アプリがクラッシュしないよう最小限のシムを提供する。
// 実際の機能はTauriプラットフォーム実装（src/app/platform/tauri/）が担う。
// 変更理由: .storybook/preview.tsx からも読まれ、tsconfig の checkJs の対象になるため、
// 引数と戻り値に型を付けて検査を通す。拡張機能APIの全形は再現せず、呼ばれる範囲だけを型にする。
(function () {
  if (typeof browser !== "undefined") return;

  const noOp = () => {};
  const asyncNoOp = async () => {};
  const listener = {
    addListener: noOp,
    removeListener: noOp,
    hasListener: () => false,
  };

  const storage = {
    local: {
      /** @param {string | string[] | null | undefined} keys */
      get: async (keys) => {
        if (keys === null || keys === undefined) {
          return getStore2All();
        }
        if (typeof keys === "string") {
          const val = getStore2String(keys);
          return val !== null ? { [keys]: val } : {};
        }
        if (Array.isArray(keys)) {
          /** @type {Record<string, string>} */
          const result = {};
          for (const key of keys) {
            const val = getStore2String(key);
            if (val !== null) result[key] = val;
          }
          return result;
        }
        return {};
      },
      /** @param {Record<string, unknown>} items */
      set: async (items) => {
        for (const [key, value] of Object.entries(items)) {
          setStore2String(key, String(value));
        }
      },
      /** @param {string | string[]} keys */
      remove: async (keys) => {
        if (typeof keys === "string") {
          removeStore2Value(keys);
        } else if (Array.isArray(keys)) {
          for (const key of keys) {
            removeStore2Value(key);
          }
        }
      },
    },
    onChanged: listener,
  };

  // 変更理由: 型定義の browser（Firefox 向けの型）と形を合わせず、この実装の形だけを持つ。
  // 代入は window へ Object.assign で行い、型の余剰プロパティ検査を受けないようにする。
  const api = {
    storage,
    tabs: {
      /** @param {{ url?: string } | undefined} props */
      create: async (props) => {
        if (props && props.url) window.open(props.url, "_blank");
        return { id: -1 };
      },
      getCurrent: async () => ({ id: -1, windowId: -1 }),
      remove: asyncNoOp,
      update: asyncNoOp,
    },
    windows: {
      /** @param {{ url?: string, width?: number, height?: number } | undefined} props */
      create: async (props) => {
        if (props && props.url) {
          const features = [
            props.width ? `width=${props.width}` : "",
            props.height ? `height=${props.height}` : "",
          ]
            .filter(Boolean)
            .join(",");
          window.open(props.url, "_blank", features);
        }
        return { id: -1, tabs: [] };
      },
      getAll: async () => [],
      getCurrent: async () => ({ id: -1, tabs: [] }),
      update: asyncNoOp,
    },
    runtime: {
      // browser.runtime.idが存在しないとwebextension-polyfillがthrowするため設定する
      id: "tauri",
      /** @param {string} path */
      getURL: (path) => path,
      sendMessage: asyncNoOp,
      onMessage: listener,
      onUpdateAvailable: listener,
      onInstalled: listener,
      onConnect: listener,
    },
    webRequest: {
      onBeforeSendHeaders: {
        addListener: noOp,
        removeListener: noOp,
        hasListener: () => false,
      },
    },
    declarativeNetRequest: {
      updateSessionRules: asyncNoOp,
      /** @param {(rules: unknown[]) => void} cb */
      getSessionRules: (cb) => {
        cb([]);
      },
    },
    bookmarks: {
      onImportBegan: listener,
      onImportEnded: listener,
      onCreated: listener,
      onRemoved: listener,
      onChanged: listener,
      onMoved: listener,
      get: async () => [],
      getChildren: async () => [],
      create: async () => null,
      update: async () => null,
      remove: asyncNoOp,
    },
    contextMenus: {
      create: () => "",
      update: asyncNoOp,
      removeAll: asyncNoOp,
      onClicked: listener,
    },
    notifications: {
      create: asyncNoOp,
      clear: asyncNoOp,
      onClicked: listener,
    },
  };

  Object.assign(window, { browser: api, chrome: api });
})();

export default window.browser;

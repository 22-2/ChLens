///<reference path="global.d.ts" />
import Config from "./app/Config";

import { setupContainer } from "./service-container/setup";

export { default as Callbacks } from "./app/Callbacks";
export * from "./app/Defer";
export * from "./app/Log";
export { default as LocalStorage } from "./app/LocalStorage";
export { default as message } from "./app/Message";
export * from "./app/Util";

let _config: Config | undefined;
if (!frameElement) {
  _config = new Config();
}

// iframe内外で統一的にconfigにアクセスできるようにProxyを使用
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    const actualConfig =
      _config || (self !== top && (parent as any).app?._config);
    if (!actualConfig) {
      console.error("config is not initialized");
      return undefined;
    }
    return actualConfig[prop as keyof Config];
  },
});

// 親ウィンドウからアクセスできるように内部configも公開
export { _config };

export const manifest = (async () => {
  if (!/^(?:chrome|moz)-extension:$/.test(location.protocol)) {
    throw new Error("manifest.jsonの取得に失敗しました");
  }
  try {
    const response = await fetch("/manifest.json");
    return await response.json();
  } catch {}
})();

export async function boot(
  path: string,
  requirements: Function | string[] | null,
  fn: Function
) {
  if (!fn && typeof requirements === "function") {
    fn = requirements;
    requirements = null;
  }

  // Chromeがiframeのsrcと無関係な内容を読み込むバグへの対応
  if (frameElement && (<HTMLIFrameElement>frameElement).src !== location.href) {
    location.href = (<HTMLIFrameElement>frameElement).src;
    return;
  }

  if (location.pathname === path) {
    const htmlVersion = document.documentElement.dataset.appVersion!;
    if ((await manifest).version !== htmlVersion) {
      location.reload();
      return;
    }

    const onload = () => {
      config.ready(() => {
        setupContainer(parent.app || (window as any).app);

        if (!requirements) {
          fn();
          return;
        }

        const modules: any[] = [];
        for (const module of <string[]>requirements) {
          modules.push(parent.app[module]);
        }
        fn(...modules);
      });
    };

    // async関数のためDOMContentLoadedに間に合わないことがある
    if (document.readyState === "loading") {
      document.on("DOMContentLoaded", onload);
    } else {
      onload();
    }
  }
}

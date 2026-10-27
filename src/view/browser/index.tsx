import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { boot } from "src/app";
import { installDebugApi } from "src/app/debug/debug-api";
import { installConsoleCapture, installRuntimeErrorCapture } from "src/app/debug/debug-log";
import { installLogPersistence } from "src/app/debug/log-persistence";
import { registerAutoRefreshCommands } from "src/features/auto-refresh/browser/register-auto-refresh-commands";
import { registerBookmarkCommands } from "src/features/bookmark/browser/register-bookmark-commands";
import { registerMediaCommands } from "src/features/media/browser/register-media-commands";
import { registerNextThreadCommands } from "src/features/next-thread/browser/register-next-thread-commands";
import { setupBrowserViewServices } from "src/service-container/setup-browser-view";
import { BrowserApp } from "src/view/browser/App";
import {
  browserCommandRegistry,
  registerCoreCommands,
} from "src/view/browser/commands/browser-commands";
import { createExtensionOwner } from "src/view/browser/extension/extension-api";

// 起動処理のエラーも外部CLIから読めるよう、boot より前に記録を始める。
installConsoleCapture();
// 描画中の例外は console を通らないため、未捕捉の例外も別に記録する。
installRuntimeErrorCapture();
// 記録を再起動後も読めるよう、IndexedDB へ保存し始める。
installLogPersistence();
installDebugApi();

// 設定の読み込みとサービスコンテナの準備を待ってから描画する。
// 変更理由: 以前はグローバルの app.boot（window.app）を呼んでいた。view・features から window.app を
// 参照しないよう lint で塞いだため（legacy-window-app-plan の Phase 3）、同じ関数を import して使う。
void boot("/view/index.html", () => {
  // メインの画面だけが使うサービスは、setupContainer（boot の中）の後、描画より前に登録する。
  setupBrowserViewServices();
  // 変更理由: コマンドパレットの表示・復元より先に登録を完了し、Reactの再描画で重複しないようにする。
  // 機能のコマンドは core のコマンドを基準に表示順を決めるため、core を最初に登録する。
  // 所有者はアプリの終了まで生きるため、解除は呼ばない。
  registerCoreCommands(createExtensionOwner("core", browserCommandRegistry).api);
  registerMediaCommands(createExtensionOwner("media", browserCommandRegistry).api);
  registerBookmarkCommands(createExtensionOwner("bookmark", browserCommandRegistry).api);
  registerAutoRefreshCommands(createExtensionOwner("auto-refresh", browserCommandRegistry).api);
  registerNextThreadCommands(createExtensionOwner("next-thread", browserCommandRegistry).api);
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
});

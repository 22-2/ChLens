import "src/app";
import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { BrowserApp } from "src/view/browser/App";
import { startMcpBridge } from "src/view/browser/mcp-bridge";

// app.boot() 経由で初期化し、core モジュールの準備完了を待つ
declare const app: {
  boot: (path: string, fn: () => void) => void;
};

app.boot("/view/index.html", () => {
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
  // MCP要求は既存の表示状態と同じThreadServiceへ渡すため、
  // サービスコンテナの初期化が完了したブラウザ画面からブリッジを開始する。
  // 変更理由: TauriのWebViewやStorybookまでlocalhostを定期ポーリングすると、
  // MCPを使っていない環境にも不要な通信を発生させるため、拡張機能ページだけで開始する。
  if (/^(?:chrome|moz)-extension:$/.test(location.protocol)) {
    startMcpBridge();
  }
});

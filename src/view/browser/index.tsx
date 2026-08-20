import { createRoot } from "react-dom/client";
import "src/app";
import "src/view/browser/styles/index.css";
import { BrowserApp } from "src/view/browser/App";

// app.boot() 経由で初期化し、core モジュールの準備完了を待つ
declare const app: {
  boot: (path: string, fn: () => void) => void;
};

app.boot("/view/index.html", () => {
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
});

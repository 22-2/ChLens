import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/spotlight/styles.css";
import "src/app";
import "src/bundle.scss";
import { BrowserApp } from "src/view/browser/App";

// app.boot() 経由で初期化し、core モジュールの準備完了を待つ
declare const app: {
  boot: (path: string, fn: () => void) => void;
};

app.boot("/view/browser.html", () => {
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<BrowserApp />);
});

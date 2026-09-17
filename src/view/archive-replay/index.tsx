import "src/app";
import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { ArchiveReplayWindow } from "src/features/archive-replay/ui/ArchiveReplayWindow";

declare const app: {
  boot: (path: string, fn: () => void) => void;
};

app.boot("/view/archive-replay.html", () => {
  const root = document.getElementById("root");
  if (!root) {
    console.error("[ArchiveReplay] root要素が見つかりません");
    return;
  }
  createRoot(root).render(<ArchiveReplayWindow />);
});

import { createRoot } from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import "src/features/comment-overlay/ui/OverlayStage.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("ChLens コメントOverlayのroot要素が見つかりません");
}

createRoot(root).render(<OverlayApp />);

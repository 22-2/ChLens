import { createRoot } from "react-dom/client";
import { OverlayApp } from "./app/OverlayApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Chlens Live Overlay root element was not found");
}

createRoot(root).render(<OverlayApp />);

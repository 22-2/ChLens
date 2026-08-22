import { createRoot } from "react-dom/client";
import { OverlayControlsApp } from "./app/OverlayControlsApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Chlens Live Overlay controls root element was not found");
}

createRoot(root).render(<OverlayControlsApp />);

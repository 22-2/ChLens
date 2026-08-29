import { createRoot } from "react-dom/client";
import "src/view/browser/styles/index.css";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Chlens Live Main root element was not found");
}

createRoot(root).render(<App />);

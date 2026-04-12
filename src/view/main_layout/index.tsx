import React from "react";
import { createRoot } from "react-dom/client";
import App from "src/view/main_layout/App";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("root");
  if (!container) return;
  createRoot(container).render(<App />);
});

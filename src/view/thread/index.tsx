import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

declare const app: any;

app.viewThread = app.viewThread || {};

app.boot("/view/thread_react.html", async function () {
  try {
    const params = app.URL.parseQuery(location.search);
    const viewUrlStr = params.get("q");

    if (!viewUrlStr) {
      alert("不正な引数です");
      return;
    }

    const container = document.getElementById("react-root");
    if (!container) {
      console.error("React root element not found");
      return;
    }

    const root = createRoot(container);
    root.render(
      <App
        initialView="thread"
        initialParams={{ q: viewUrlStr }}
      />
    );
  } catch (error) {
    console.error("Failed to initialize React app:", error);
  }
});

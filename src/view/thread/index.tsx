import React from "react";
import { createRoot } from "react-dom/client";
import { ThreadView } from "./ThreadView";

declare const app: any;

app.viewThread = app.viewThread || {};

app.boot("/view/thread_react.html", async function () {
  const viewUrlStr = app.URL.parseQuery(location.search).get("q");
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
  root.render(<ThreadView viewUrl={viewUrlStr} />);
});

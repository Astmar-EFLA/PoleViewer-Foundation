import React from "react";
import ReactDOM from "react-dom/client";
import { ViewerExportApp } from "./ViewerExportApp";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ViewerExportApp />
  </React.StrictMode>
);

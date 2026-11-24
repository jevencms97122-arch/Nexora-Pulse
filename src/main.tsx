import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { PulseProvider } from "./state/pulse";
import { applyStoredTheme } from "./state/theme";

applyStoredTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PulseProvider>
      <App />
    </PulseProvider>
  </React.StrictMode>,
);

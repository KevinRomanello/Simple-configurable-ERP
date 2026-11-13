import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, readTheme } from "./lib/theme";
import "./theme/base.css";
import "./theme/components.css";

// the look this person chose (in Settings) is on the page before anything is drawn
applyTheme(readTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App";
import { initTheme } from "./lib/theme";
import { readTerminalAppearance } from "./lib/terminal-appearance";
import { applyTerminalThemeAttribute } from "./lib/terminal-theme";
import { I18nProvider } from "./i18n/I18nProvider";

initTheme();
// Before the first render: the terminal's palette is CSS, and a pane that
// mounted ahead of its attribute would paint in the stylesheet's default.
applyTerminalThemeAttribute(readTerminalAppearance().themeId);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

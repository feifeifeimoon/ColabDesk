/**
 * Application shortcuts, registered once on the window.
 *
 * State is read when a key is pressed rather than captured when the listener
 * was made: a listener that closed over one render's state would act on
 * whatever was true back then. The combinations all carry `Shift`, so nothing
 * here collides with what a shell wants (Ctrl+C stays SIGINT).
 */

import { useEffect } from "react";
import { useAppStore } from "../store";

export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useAppStore.getState();

      if (event.key === "Escape" && store.settingsOpen) {
        store.closeSettings();
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;

      if (event.key === "," && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        store.openSettings();
        return;
      }
      if (!event.shiftKey) return;

      if (event.code === "KeyT") {
        // Terminal convention: new terminal. The runtime itself is Ctrl+Shift+N.
        event.preventDefault();
        event.stopPropagation();
        if (store.selectedSession) store.openTab(store.selectedSession);
      } else if (event.code === "KeyN") {
        event.preventDefault();
        event.stopPropagation();
        store.openNewSession();
      } else if (event.code === "KeyW") {
        event.preventDefault();
        event.stopPropagation();
        // Closing a tab with unsaved edits is a question, not an action.
        if (store.activeTabId) store.requestCloseTab(store.activeTabId);
      } else if (event.code === "KeyB") {
        event.preventDefault();
        event.stopPropagation();
        store.toggleFiles();
      } else if (event.code === "KeyE") {
        event.preventDefault();
        event.stopPropagation();
        store.toggleSidebar();
      } else if (/^Digit[1-9]$/.test(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        store.focusTabAt(Number.parseInt(event.code.slice(5), 10) - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

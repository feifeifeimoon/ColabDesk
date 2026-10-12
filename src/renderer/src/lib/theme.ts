/**
 * The theme preference. `system` follows the OS; `light` and `dark` are explicit
 * choices and outrank it — which is what the top bar's toggle makes. Stored in
 * localStorage like the terminal font size: it is a UI preference, not state the
 * main process needs.
 *
 * `data-theme` on `<html>` is the single switch. Tokens are declared once for
 * light (`:root`) and once for dark (`:root[data-theme="dark"]`, which is also
 * the `.dark` block that permanently-dark subtrees reuse), so applying a theme
 * is one attribute write — no duplicated media query to drift out of date.
 */

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "colabdesk.theme";
const query = window.matchMedia("(prefers-color-scheme: dark)");

export function systemTheme(): Theme {
  return query.matches ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function saveThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(preference: ThemePreference): Theme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/** What the top bar's toggle asks for: the opposite of what is on screen now. */
export function toggleThemePreference(preference: ThemePreference): ThemePreference {
  return resolveTheme(preference) === "dark" ? "light" : "dark";
}

/** Keeps `system` live: the OS can flip while the app is open. */
export function watchSystemTheme(listener: () => void): () => void {
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function initTheme(): void {
  applyTheme(readThemePreference());
}

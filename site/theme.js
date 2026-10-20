// Runs before the stylesheets so a dark-OS visitor never sees the light lockup
// flash past, and marks that scripting is on so CSS can reveal what needs it.
document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
document.documentElement.classList.add("js");

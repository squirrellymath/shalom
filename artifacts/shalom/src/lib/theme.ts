export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("shalom-theme", dark ? "dark" : "light");
}

export function initTheme(): boolean {
  const stored = localStorage.getItem("shalom-theme");
  const dark = stored
    ? stored === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

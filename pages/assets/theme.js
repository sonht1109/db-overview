/* Theme toggle: cycles System -> Light -> Dark -> System.
 * The actual variable values live in style.css; this script only
 * sets/removes a `data-theme` attribute on <html> and remembers the
 * choice in localStorage. A tiny inline script in <head> (see any page)
 * applies the stored choice before first paint to avoid a flash.
 */
(function () {
  "use strict";

  var KEY = "db-theme";
  var ICONS = { system: "\u{1F5A5}\uFE0F", light: "\u2600\uFE0F", dark: "\u{1F319}" };
  var LABELS = { system: "System", light: "Light", dark: "Dark" };
  var ORDER = ["system", "light", "dark"];

  function getStored() {
    try {
      var v = localStorage.getItem(KEY);
      return ORDER.indexOf(v) >= 0 ? v : "system";
    } catch (_) {
      return "system";
    }
  }

  function setStored(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch (_) {}
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  function nextTheme(theme) {
    var idx = ORDER.indexOf(theme);
    return ORDER[(idx + 1) % ORDER.length];
  }

  function updateButton(btn, theme) {
    btn.textContent = ICONS[theme];
    var label = "Theme: " + LABELS[theme] + " (click to change)";
    btn.setAttribute("title", label);
    btn.setAttribute("aria-label", label);
  }

  function init() {
    var theme = getStored();
    apply(theme);

    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    updateButton(btn, theme);

    btn.addEventListener("click", function () {
      theme = nextTheme(theme);
      apply(theme);
      setStored(theme);
      updateButton(btn, theme);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

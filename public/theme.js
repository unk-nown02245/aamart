"use strict";

(function () {
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function applyTheme() {
    var dark = !!(media && media.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#101318" : "#1a56db");
  }

  applyTheme();

  if (media) {
    if (media.addEventListener) media.addEventListener("change", applyTheme);
    else if (media.addListener) media.addListener(applyTheme);
  }
})();

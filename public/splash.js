"use strict";

(function () {
  var splash = document.getElementById("site-splash");
  if (!splash) return;

  var minVisible = 1000;
  var maxWait = 2200;
  var startedAt = Date.now();
  var hiding = false;

  function hide() {
    if (hiding) return;
    hiding = true;
    var wait = Math.max(0, minVisible - (Date.now() - startedAt));
    window.setTimeout(function () {
      splash.classList.add("is-hiding");
      splash.setAttribute("aria-hidden", "true");
      window.setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 560);
    }, wait);
  }

  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide, { once: true });

  window.setTimeout(hide, maxWait);
})();

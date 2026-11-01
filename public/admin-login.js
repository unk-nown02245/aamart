"use strict";

(function () {
  var TOKEN_KEY = "aamart_admin_token";
  var form = document.getElementById("login-form");
  var errorBox = document.getElementById("login-error");
  var button = document.getElementById("login-btn");

  function homeFor(role) {
    return role === "manager" ? "/admin/aditism" : "/admin/amirhamza";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function existingToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  async function resumeSession() {
    var token = existingToken();
    if (!token) return;
    try {
      var res = await fetch("/api/admin/me", {
        headers: { Authorization: "Bearer " + token },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("expired");
      var data = await res.json();
      localStorage.setItem("aamart_admin", JSON.stringify(data.admin));
      window.location.replace(homeFor(data.admin.role));
    } catch (e) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (err) {}
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearError();
    var fd = new FormData(form);
    var username = String(fd.get("username") || "").trim();
    var password = String(fd.get("password") || "");
    if (!username || !password) {
      showError("Enter your username and password.");
      return;
    }
    button.disabled = true;
    button.textContent = "Signing in\u2026";
    try {
      var res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username, password: password }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) throw new Error((data && data.error) || "Unable to sign in.");
      try {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem("aamart_admin", JSON.stringify(data.admin));
      } catch (e) {}
      window.location.replace(homeFor(data.admin.role));
    } catch (err) {
      showError(err.message || "Unable to sign in.");
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });

  resumeSession();
})();

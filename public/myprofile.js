const API = "/api";
let me = null;

function $(id) { return document.getElementById(id); }

function getToken() { return localStorage.getItem("AAMART_customer_token") || ""; }
function setToken(t) {
  if (t) localStorage.setItem("AAMART_customer_token", t);
  else localStorage.removeItem("AAMART_customer_token");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove("show"), 2200);
}
function notYet() { toast("This feature is coming soon"); return false; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function showPanel(name, title) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  const panel = $("panel-" + name);
  if (panel) panel.classList.add("active");
  document.querySelectorAll(".profile-nav").forEach((b) => b.classList.remove("active"));
  const src = event && event.target && event.target.closest ? event.target.closest(".profile-nav") : null;
  if (src) src.classList.add("active");
  if (name === "generic") {
    $("genericTitle").textContent = title || "Coming Soon";
    $("genericMsg").textContent = (title ? "You have nothing saved under " + title + " yet." : "This section is empty.");
  }
}

function doLogout() {
  setToken("");
  location.href = "/";
  return false;
}

function fillUser(u) {
  const displayName = u.name || ((u.firstName || "") + " " + (u.lastName || "")).trim() || u.email;
  $("sideUser").textContent = displayName;
  const ub = $("userBtn");
  if (ub) ub.innerHTML = '<span class="uname">' + esc(displayName) + '</span> <span>&#9662;</span>';
  $("pfFirst").value = u.firstName || "";
  $("pfLast").value = u.lastName || "";
  $("pfEmail").value = u.email || "";
  $("pfPhone").value = u.phone || "";
  document.querySelectorAll('input[name="gender"]').forEach((r) => (r.checked = r.value === (u.gender || "")));
}

async function savePersonal() {
  const genderEl = document.querySelector('input[name="gender"]:checked');
  const body = {
    firstName: $("pfFirst").value.trim(),
    lastName: $("pfLast").value.trim(),
    gender: genderEl ? genderEl.value : "",
    phone: $("pfPhone").value.trim(),
  };
  if (!body.firstName) return toast("First name cannot be empty");
  if (body.phone.replace(/\D/g, "").length !== 10) return toast("Enter a valid 10-digit mobile");
  try {
    const res = await fetch(API + "/auth/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");
    me = data.user;
    fillUser(me);
    toast("Profile updated");
  } catch (e) { toast(e.message); }
}

async function loadMe() {
  if (!getToken()) { location.href = "/?login=1"; return; }
  try {
    const res = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + getToken() } });
    if (!res.ok) throw new Error("not logged in");
    const data = await res.json();
    me = data.user;
    fillUser(me);
  } catch {
    setToken("");
    location.href = "/?login=1";
  }
}

async function loadCategories() {
  try {
    const res = await fetch(API + "/categories");
    const data = await res.json();
    const bar = $("catBar");
    const items = [{ name: "All Products" }].concat(data.categories);
    bar.innerHTML = items.map((c) =>
      `<a class="cat-item" href="/">${c.name === "All Products" ? "\u{1F3E0} All Products" : (c.icon || "\u{1F3F7}") + " " + c.name}</a>`
    ).join("");
  } catch {}
}

function hideSplash() {
  const s = $("splash");
  if (s) s.classList.add("hide");
}

setTimeout(hideSplash, 2200);
$("year").textContent = new Date().getFullYear();
loadCategories();
loadMe();
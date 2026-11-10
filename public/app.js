"use strict";

/* ---------------------------------------------------------------------------
   Aamart storefront (vanilla JS, hash router, mobile first)
   --------------------------------------------------------------------------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const state = {
  token: localStorage.getItem("aamart_token") || "",
  user: null,
  settings: null,
  categories: [],
  cartCount: 0,
  wishlist: new Set(),
  recentlyViewed: JSON.parse(localStorage.getItem("aamart_recent") || "[]"),
  appliedCoupon: null,
  checkout: { addressId: null, payment: "COD" },
  pd: { variant: "", qty: 1, imageIndex: 0 },
  otpEmail: "",
  otpMode: "login",
  otpSent: false,
  resetSent: false,
  registerSent: false,
  reviewRating: 5,
  listing: null,
  route: null,
  timers: [],
};

let renderToken = 0;

const I18N = {
  home: "Home", categories: "Categories", cart: "Cart", orders: "Orders", account: "Account",
  search: "Search Aamart", searchAria: "Search Aamart", addToCart: "Add to Cart", buyNow: "Buy Now",
  viewAll: "View all", deals: "Deals of the Day", trending: "Trending Products",
  newArrivals: "New Arrivals", bestDiscounts: "Best Discounts", recentlyViewed: "Recently Viewed",
  proceed: "Proceed to Checkout", placeOrder: "Place Order", continue: "Continue",
  login: "Login", register: "Create Account", logout: "Logout", wishlist: "Wishlist",
  emptyCart: "Your cart is empty", emptyOrders: "No orders yet", emptyWishlist: "Your wishlist is empty",
  free: "FREE", total: "Total", itemTotal: "Item total", discount: "Discount",
  delivery: "Delivery", tax: "Tax", coupon: "Coupon", apply: "Apply", remove: "Remove",
  inStock: "In stock", outOfStock: "Out of stock", lowStock: "Only a few left",
  clear: "Clear", recentSearches: "Recent searches", noMatches: "No matches for", seeAllResults: "See all results for",
};
function t(key) {
  return I18N[key] || key;
}

const ORDER_FILTERS = {
  all: { label: "All", statuses: null },
  "to-ship": { label: "To Ship", statuses: ["Ordered", "Packed"] },
  "in-transit": { label: "In Transit", statuses: ["Shipped", "Out for Delivery"] },
  delivered: { label: "Delivered", statuses: ["Delivered"] },
};

const ICON_PATHS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"></path><path d="M5.5 9.5v10h13v-10"></path><path d="M9.5 19.5v-5h5v5"></path>',
  package: '<path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4z"></path><path d="M4 7.5 12 11.5l8-4"></path><path d="M12 11.5v9"></path>',
  box: '<rect x="4" y="7" width="16" height="13" rx="2"></rect><path d="M8 7V5h8v2"></path><path d="M4 11h16"></path>',
  truck: '<path d="M3.5 6.5h10v9h-10z"></path><path d="M13.5 9.5h3.5l3 3v3h-6.5"></path><circle cx="7" cy="17.5" r="1.5"></circle><circle cx="17" cy="17.5" r="1.5"></circle>',
  check: '<circle cx="12" cy="12" r="8.5"></circle><path d="m8.5 12 2.3 2.3 4.7-4.8"></path>',
  heart: '<path d="M12 20s-7-4.3-7-9.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7 3.4C19 15.7 12 20 12 20z"></path>',
  pin: '<path d="M12 21s6.5-5.4 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.6 6.5 11 6.5 11z"></path><circle cx="12" cy="10" r="2.3"></circle>',
  card: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="M3.5 10h17"></path><path d="M7 14.5h4"></path>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 6 2 6h-15s2-1 2-6z"></path><path d="M10 19a2 2 0 0 0 4 0"></path>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>',
  help: '<circle cx="12" cy="12" r="8.5"></circle><path d="M9.7 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.5 2-2.5 3.5"></path><path d="M12 17h.01"></path>',
  chevron: '<path d="m9 6 6 6-6 6"></path>',
  pencil: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"></path><path d="m13.5 6.5 3 3"></path>',
  logout: '<path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H9"></path><path d="M15 8l4 4-4 4"></path><path d="M19 12H9"></path>',
  clock: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 1.8"></path>',
  user: '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 20c.6-3.5 3.2-5.5 7-5.5s6.4 2 7 5.5"></path>',
};

function icon(name, className) {
  return '<svg class="' + (className || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || "") + "</svg>";
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

function escapeHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(value) {
  const raw = String(value == null ? "" : value).trim();
  if (raw.startsWith("#/") || (raw.startsWith("/") && !raw.startsWith("//"))) return escapeHtml(raw);
  try {
    const parsed = new URL(raw, location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? escapeHtml(parsed.href) : "#/";
  } catch {
    return "#/";
  }
}

function safeImage(value) {
  const raw = String(value == null ? "" : value).trim();
  if ((raw.startsWith("/") && !raw.startsWith("//")) || /^https:\/\//i.test(raw)) return escapeHtml(raw);
  return "/img/placeholder.svg";
}

function categoryImage(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "/img/categories/default.svg";
  return safeImage(raw);
}

function setupImageFallbacks() {
  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!img || img.tagName !== "IMG" || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = "1";
    img.src = img.dataset.fallback || "/img/placeholder.svg";
  }, true);
}

setupImageFallbacks();

function setMeta(title, description) {
  document.title = title ? title + " - Aamart" : "Aamart - Online Shopping";
  const meta = document.querySelector('meta[name="description"]');
  if (meta && description) meta.setAttribute("content", description);
}

function money(n) {
  const num = Number(n || 0);
  const formatted = Number.isInteger(num)
    ? num.toLocaleString("en-IN")
    : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "\u20B9" + formatted;
}

function stars(rating) {
  const r = Math.round(Number(rating || 0));
  return "\u2605".repeat(Math.max(0, Math.min(5, r))) + "\u2606".repeat(Math.max(0, 5 - r));
}

function statusClass(status) {
  return status === "Out for Delivery" ? "Out" : status;
}

function clearTimers() {
  state.timers.forEach((t) => clearInterval(t));
  state.timers = [];
}

function showToast(message, type) {
  const wrap = $("#toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .25s";
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

function showModal(html) {
  const root = $("#modal-root");
  root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + html + "</div></div>";
  const backdrop = $(".modal-backdrop", root);
  if (backdrop) backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
}
function closeModal() {
  $("#modal-root").innerHTML = "";
}

async function api(path, opts) {
  const options = opts || {};
  const method = options.method || "GET";
  const headers = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (state.token && options.auth !== false) headers["Authorization"] = "Bearer " + state.token;
  if (!["GET", "HEAD"].includes(method)) headers["X-CSRF-Token"] = getCookie("csrf");

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error. Please check your connection.", 0);
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new ApiError((data && data.error) || "Something went wrong", res.status);
  return data;
}

function saveToken(token, user) {
  state.token = token || "";
  state.user = user || null;
  if (token) localStorage.setItem("aamart_token", token);
  else localStorage.removeItem("aamart_token");
}
function clearAuth() {
  saveToken("", null);
  state.wishlist = new Set();
  state.cartCount = 0;
  updateChrome(state.route);
}
function isLoggedIn() {
  return !!state.token;
}

async function refreshMe() {
  if (!state.token) return;
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
    if (data.token) saveToken(data.token, data.user);
  } catch (e) {
    if (e.status === 401) clearAuth();
  }
}

async function refreshWishlist() {
  if (!state.token) { state.wishlist = new Set(); return; }
  try {
    const data = await api("/api/wishlist");
    state.wishlist = new Set(data.items.map((p) => p.id));
  } catch {}
}

async function refreshCart() {
  if (!state.token) { state.cartCount = 0; updateChrome(state.route); return; }
  try {
    const data = await api("/api/cart");
    state.cartCount = data.count;
  } catch { state.cartCount = 0; }
  updateChrome(state.route);
}

function updateChrome(route) {
  [$("#cart-badge"), $("#nav-cart-badge")].forEach((badge) => {
    if (!badge) return;
    badge.textContent = state.cartCount;
    badge.hidden = !state.cartCount;
  });
  const search = $("#search-input");
  if (search) {
    search.placeholder = t("search");
    search.setAttribute("aria-label", t("searchAria"));
  }
  const searchClear = $("#search-clear");
  if (searchClear) searchClear.setAttribute("aria-label", t("clear"));
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const navName = route ? route.name : "home";
  $$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.nav === navName));
  const accountLink = $("#account-link");
  if (accountLink) {
    const label = accountLink.querySelector(".label");
    if (label) label.textContent = state.user ? (state.user.name || "Account").split(" ")[0] : t("account");
  }
}

/* ---------------------------------------------------------------------------
   Router
   --------------------------------------------------------------------------- */
function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const query = {};
  new URLSearchParams(queryPart || "").forEach((v, k) => { query[k] = v; });
  if (!parts.length) return { name: "home", query, path: "/" };
  const head = parts[0];
  if (head === "product" && parts[1]) return { name: "product", id: parts[1], query, path: pathPart };
  if (head === "products") return { name: "products", query, path: pathPart };
  if (head === "categories") return { name: "categories", query, path: pathPart };
  if (head === "cart") return { name: "cart", query, path: pathPart };
  if (head === "checkout") return { name: "checkout", query, path: pathPart };
  if (head === "orders") return { name: "orders", query, path: pathPart };
  if (head === "order" && parts[1]) return { name: "order", id: parts[1], query, path: pathPart };
  if (head === "success" && parts[1]) return { name: "success", id: parts[1], query, path: pathPart };
  if (head === "account") return { name: "account", query, path: pathPart };
  if (head === "recent") return { name: "recent", query, path: pathPart };
  if (head === "wishlist") return { name: "wishlist", query, path: pathPart };
  if (head === "login") return { name: "login", query, path: pathPart };
  if (head === "register") return { name: "register", query, path: pathPart };
  if (head === "forgot") return { name: "forgot", query, path: pathPart };
  if (["privacy", "terms", "returns", "contact"].includes(head)) return { name: "page", page: head, query, path: pathPart };
  return { name: "notfound", query, path: pathPart };
}

function currentPath() {
  return location.hash.replace(/^#/, "") || "/";
}

function go(path) {
  location.hash = "#" + path;
}

function requireAuth(next) {
  if (isLoggedIn()) return true;
  go("/login?next=" + encodeURIComponent(next || currentPath()));
  return false;
}

async function render() {
  const token = ++renderToken;
  clearTimers();
  if (document.body.classList.contains("filters-open")) closeFilters();
  const route = parseRoute();
  state.route = route;
  updateChrome(route);
  const appEl = $("#app");
  if (!appEl) return;
  appEl.innerHTML = '<div class="loader"><span class="spinner"></span> Loading...</div>';
  try {
    switch (route.name) {
      case "home": return await renderHome(token);
      case "categories": return await renderCategories(token);
      case "products": return await renderProducts(token, route);
      case "product": return await renderProduct(token, route.id);
      case "cart": return await renderCart(token);
      case "checkout": return await renderCheckout(token);
      case "orders": return await renderOrders(token, route);
      case "order": return await renderOrder(token, route.id);
      case "success": return await renderSuccess(token, route.id);
      case "account": return await renderAccount(token);
      case "recent": return await renderRecent(token);
      case "wishlist": return await renderWishlist(token);
      case "login": return renderLogin(token, route);
      case "register": return renderRegister(token, route);
      case "forgot": return renderForgot(token, route);
      case "page": return renderLegal(route.page);
      case "notfound": return renderNotFound();
      default: return await renderHome(token);
    }
  } catch (e) {
    if (token !== renderToken) return;
    if (e.status === 401) {
      clearAuth();
      go("/login?next=" + encodeURIComponent(route.path || "/"));
      return;
    }
    appEl.innerHTML = errorView(e.message || "Something went wrong. Please try again.");
  }
}

/* ---------------------------------------------------------------------------
   Shared components
   --------------------------------------------------------------------------- */
function loaderHtml(text) {
  return '<div class="loader"><span class="spinner"></span> ' + escapeHtml(text || "Loading...") + "</div>";
}

function errorView(message) {
  return '<div class="empty"><div class="e-icon">\u26A0\uFE0F</div><h3>Something went wrong</h3><p>' +
    escapeHtml(message) + '</p><a class="btn" href="#/">Go to Home</a></div>';
}

function emptyView(icon, title, text, actionHref, actionLabel) {
  return '<div class="empty"><div class="e-icon">' + icon + "</div><h3>" + escapeHtml(title) + "</h3><p>" +
    escapeHtml(text || "") + "</p>" +
    (actionHref ? '<a class="btn" href="' + actionHref + '">' + escapeHtml(actionLabel || "Continue") + "</a>" : "") +
    "</div>";
}

function productCard(p) {
  const discount = p.discount > 0 ? '<span class="pc-discount">' + p.discount + "% OFF</span>" : "";
  const wishActive = state.wishlist.has(p.id) ? " active" : "";
  const stockClass = p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "in";
  const stockText = p.stock <= 0 ? t("outOfStock") : p.stock <= 5 ? t("lowStock") + " (" + p.stock + ")" : t("inStock");
  return (
    '<article class="product-card">' +
      '<a class="pc-media" href="#/product/' + p.id + '">' +
        '<img src="' + safeImage(p.image) + '" alt="' + escapeHtml(p.title) + '" loading="lazy" data-fallback="/img/placeholder.svg">' +
        discount +
      "</a>" +
      '<button class="pc-wish' + wishActive + '" data-action="wishlist" data-id="' + p.id + '" aria-label="Add to wishlist">\u2665</button>' +
      '<div class="pc-body">' +
        '<div class="pc-brand">' + escapeHtml(p.brand || "Aamart") + "</div>" +
        '<a class="pc-title" href="#/product/' + p.id + '">' + escapeHtml(p.title) + "</a>" +
        '<div class="pc-rating"><span class="stars">' + stars(p.rating) + "</span><span>" + Number(p.rating || 0).toFixed(1) + " (" + (p.ratingCount || 0) + ")</span></div>" +
        '<div class="pc-price"><span class="now">' + money(p.price) + '</span>' +
          (p.mrp > p.price ? '<span class="mrp">' + money(p.mrp) + "</span>" : "") +
          (p.discount > 0 ? '<span class="off">' + p.discount + "% off</span>" : "") +
        "</div>" +
        '<div class="pc-stock ' + stockClass + '">' + stockText + "</div>" +
        '<div class="pc-actions">' +
          (p.stock > 0
            ? '<button class="btn small" data-action="add-cart" data-id="' + p.id + '">' + t("addToCart") + "</button>"
            : '<button class="btn small ghost" disabled>Out of stock</button>') +
        "</div>" +
      "</div>" +
    "</article>"
  );
}

function productRail(products) {
  if (!products || !products.length) return '<p class="muted small">No products to show.</p>';
  return '<div class="rail">' + products.map(productCard).join("") + "</div>";
}

async function loadRecentProducts(limit) {
  const ids = state.recentlyViewed.slice(0, limit || 12);
  if (!ids.length) return [];
  const products = await Promise.all(ids.map((id) => api("/api/products/" + encodeURIComponent(id), { auth: false }).catch(() => null)));
  return products.filter(Boolean);
}

function sectionHead(title, href) {
  return '<div class="section-head"><h2>' + escapeHtml(title) + "</h2>" +
    (href ? '<a href="' + href + '">' + t("viewAll") + " \u203A</a>" : "") + "</div>";
}

/* ---------------------------------------------------------------------------
   Home
   --------------------------------------------------------------------------- */
async function renderHome(token) {
  const [bannersRes, catsRes, dealsRes, trendingRes, newRes, bestRes] = await Promise.all([
    api("/api/banners", { auth: false }).catch(() => ({ banners: [] })),
    api("/api/categories", { auth: false }).catch(() => ({ categories: [] })),
    api("/api/products?sort=discount&limit=8", { auth: false }).catch(() => ({ products: [] })),
    api("/api/products?sort=popularity&limit=8", { auth: false }).catch(() => ({ products: [] })),
    api("/api/products?sort=newest&limit=8", { auth: false }).catch(() => ({ products: [] })),
    api("/api/products?sort=discount&discount=20&limit=8", { auth: false }).catch(() => ({ products: [] })),
  ]);
  if (token !== renderToken) return;
  state.categories = catsRes.categories || [];

  let recent = [];
  if (state.recentlyViewed.length) {
    const results = await Promise.all(state.recentlyViewed.slice(0, 6).map((id) => api("/api/products/" + id, { auth: false }).catch(() => null)));
    recent = results.filter(Boolean);
    if (token !== renderToken) return;
  }

  const banners = bannersRes.banners || [];
  const cats = state.categories.slice(0, 10);
  setMeta("Online Shopping", "Shop electronics, fashion, home essentials and more at Aamart.");

  let html = "";
  if (banners.length) {
    html += '<div class="banner-slider"><div class="banner-track">' +
      banners.map((b) => '<a class="banner-slide" href="' + safeHref(b.link || "#/") + '"><img src="' + safeImage(b.image) + '" alt="' + escapeHtml(b.title) + '"></a>').join("") +
      '</div><div class="banner-dots">' + banners.map((_, i) => '<button class="' + (i === 0 ? "active" : "") + '" data-action="banner-dot" data-index="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>').join("") + "</div></div>";
  }

  html += '<div class="offer-strip">' +
    '<div class="offer-tile"><div class="oi">\u{1F69A}</div><div class="ot">Free Delivery</div><div class="os">Above \u20B9499</div></div>' +
    '<div class="offer-tile"><div class="oi">\u{1F3F7}\uFE0F</div><div class="ot">Coupons</div><div class="os">Save more</div></div>' +
    '<div class="offer-tile"><div class="oi">\u21A9\uFE0F</div><div class="ot">Easy Returns</div><div class="os">7-day returns</div></div>' +
    "</div>";

  html += '<div class="section"><div class="section-head"><h2>' + t("categories") + '</h2><a href="#/categories">' + t("viewAll") + ' \u203A</a></div><div class="cat-strip">' +
    cats.map((c) => '<a class="cat-chip" href="#/products?category=' + encodeURIComponent(c.slug) + '"><span class="cat-thumb"><img src="' + categoryImage(c.image) + '" alt="' + escapeHtml(c.name) + '" loading="lazy" data-fallback="/img/categories/default.svg"></span><span class="cname">' + escapeHtml(c.name) + '</span><span class="ccount">' + c.count + " items</span></a>").join("") +
    "</div></div>";

  html += '<div class="section">' + sectionHead(t("deals"), "#/products?sort=discount") + productRail(dealsRes.products) + "</div>";
  html += '<div class="section">' + sectionHead(t("trending"), "#/products?sort=popularity") + productRail(trendingRes.products) + "</div>";
  html += '<div class="section">' + sectionHead(t("newArrivals"), "#/products?sort=newest") + productRail(newRes.products) + "</div>";
  html += '<div class="section">' + sectionHead(t("bestDiscounts"), "#/products?sort=discount&discount=20") + productRail(bestRes.products) + "</div>";
  if (recent.length) {
    html += '<div class="section">' + sectionHead(t("recentlyViewed"), "") + productRail(recent) + "</div>";
  }

  $("#app").innerHTML = html;
  setupBannerSlider();
}

function setupBannerSlider() {
  const track = $(".banner-track");
  if (!track) return;
  const slides = track.children.length;
  if (slides < 2) return;
  const dots = $$(".banner-dots button");
  let index = 0;
  const goTo = (n) => {
    index = (n + slides) % slides;
    track.style.transform = "translateX(-" + index * 100 + "%)";
    dots.forEach((d, i) => d.classList.toggle("active", i === index));
  };
  dots.forEach((d) => d.addEventListener("click", () => goTo(Number(d.dataset.index))));
  const timer = setInterval(() => goTo(index + 1), 4500);
  state.timers.push(timer);
}

/* ---------------------------------------------------------------------------
   Categories
   --------------------------------------------------------------------------- */
async function renderCategories(token) {
  const data = await api("/api/categories", { auth: false });
  if (token !== renderToken) return;
  state.categories = data.categories || [];
  setMeta("Shop by Category", "Browse all Aamart categories and find what you need.");
  const html = '<div class="page-head"><div><h1>Shop by Category</h1><p class="muted small">Find everything you need, organised for easy browsing.</p></div></div>' +
    '<div class="category-grid">' +
    state.categories.map((c) =>
      '<a class="category-card" href="#/products?category=' + encodeURIComponent(c.slug) + '">' +
        '<div class="category-card-media"><img src="' + categoryImage(c.image) + '" alt="' + escapeHtml(c.name) + '" loading="lazy" data-fallback="/img/categories/default.svg"></div>' +
        '<div class="category-card-body"><span class="category-card-name">' + escapeHtml(c.name) + '</span><span class="category-card-count">' + c.count + " items</span></div>" +
      "</a>"
    ).join("") + "</div>";
  $("#app").innerHTML = html;
}

/* ---------------------------------------------------------------------------
   Product listing
   --------------------------------------------------------------------------- */
function parseCsv(value) {
  return String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
}

function draftFromQuery(q) {
  return {
    q: q.q || "",
    category: q.category || "",
    sub: q.sub || "",
    sort: q.sort || "popularity",
    brand: parseCsv(q.brand),
    gender: parseCsv(q.gender),
    color: parseCsv(q.color),
    size: parseCsv(q.size),
    age_group: parseCsv(q.age_group),
    offers: parseCsv(q.offers),
    minPrice: q.minPrice || "",
    maxPrice: q.maxPrice || "",
    rating: q.rating || "",
    discount: q.discount || "",
    newArrival: q.newArrival === "1" || q.new_arrivals === "1",
  };
}

function draftToParams(draft) {
  const params = new URLSearchParams();
  if (draft.q) params.set("q", draft.q);
  if (draft.category) params.set("category", draft.category);
  if (draft.sub) params.set("sub", draft.sub);
  if (draft.sort && draft.sort !== "popularity") params.set("sort", draft.sort);
  ["brand", "gender", "color", "size", "age_group", "offers"].forEach((kind) => {
    if (draft[kind] && draft[kind].length) params.set(kind, draft[kind].join(","));
  });
  if (draft.minPrice !== "") params.set("minPrice", draft.minPrice);
  if (draft.maxPrice !== "") params.set("maxPrice", draft.maxPrice);
  if (draft.rating) params.set("rating", draft.rating);
  if (draft.discount) params.set("discount", draft.discount);
  if (draft.newArrival) params.set("newArrival", "1");
  return params;
}

function normalizeDraftIds(filterData, draft) {
  const multiKeys = ["brand", "gender", "color", "size", "age_group", "offers"];
  (filterData.groups || []).forEach((group) => {
    if (multiKeys.indexOf(group.key) < 0) return;
    const normalized = [];
    (draft[group.key] || []).forEach((token) => {
      const option = (group.options || []).filter((o) =>
        String(token).toLowerCase() === String(o.id || "").toLowerCase() ||
        String(token).toLowerCase() === String(o.value || "").toLowerCase() ||
        String(token).toLowerCase() === String(o.name || "").toLowerCase()
      )[0];
      const value = String(option ? (option.id || option.value) : token);
      if (normalized.indexOf(value) < 0) normalized.push(value);
    });
    draft[group.key] = normalized;
  });
}

function draftHref(draft) {
  const text = draftToParams(draft).toString();
  return "#/products" + (text ? "?" + text : "");
}

function filterGroupSelectionCount(group, draft) {
  if (group.key === "price") return draft.minPrice !== "" || draft.maxPrice !== "" ? 1 : 0;
  if (group.key === "rating") return draft.rating ? 1 : 0;
  if (group.key === "discount") return draft.discount ? 1 : 0;
  if (group.key === "new_arrivals") return draft.newArrival ? 1 : 0;
  if (group.key === "sort") return 0;
  return (draft[group.key] || []).length;
}

function activeFilterChips(filterData, draft) {
  const chips = [];
  const optionName = (group, id) => {
    const option = (group.options || []).filter((o) => String(o.id || o.value) === String(id))[0];
    return option ? option.name : id;
  };
  if (draft.category) {
    const next = { ...draft, category: "", sub: "" };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 ' + escapeHtml(draft.category) + "</a>");
  }
  if (draft.sub) {
    const next = { ...draft, sub: "" };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 ' + escapeHtml(draft.sub) + "</a>");
  }
  (filterData.groups || []).forEach((group) => {
    if (group.key === "sort" || group.key === "price" || group.key === "rating" || group.key === "discount" || group.key === "new_arrivals") return;
    (draft[group.key] || []).forEach((id) => {
      const next = { ...draft, [group.key]: (draft[group.key] || []).filter((v) => String(v) !== String(id)) };
      chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 ' + escapeHtml(optionName(group, id)) + "</a>");
    });
  });
  if (draft.minPrice !== "" || draft.maxPrice !== "") {
    const next = { ...draft, minPrice: "", maxPrice: "" };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 \u20B9' + escapeHtml(draft.minPrice || "0") + " \u2013 \u20B9" + escapeHtml(draft.maxPrice || "\u221E") + "</a>");
  }
  if (draft.rating) {
    const next = { ...draft, rating: "" };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 ' + escapeHtml(draft.rating) + "\u2605 & up</a>");
  }
  if (draft.discount) {
    const next = { ...draft, discount: "" };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 ' + escapeHtml(draft.discount) + "%+ off</a>");
  }
  if (draft.newArrival) {
    const next = { ...draft, newArrival: false };
    chips.push('<a class="chip" href="' + draftHref(next) + '">\u2715 New arrivals</a>');
  }
  return chips;
}

function filterGroupContent(group, draft) {
  if (group.key === "sort") {
    return '<div class="fopt-list">' + (group.options || []).map((option) =>
      '<label class="fopt"><input type="radio" name="f-sort" data-filter-kind="sort" value="' + escapeHtml(option.value) + '"' + (draft.sort === option.value ? " checked" : "") + '><span>' + escapeHtml(option.name) + "</span></label>"
    ).join("") + "</div>";
  }
  if (group.key === "brand") {
    return '<label class="filter-search"><span>\u{1F50D}</span><input type="search" placeholder="Search brands" data-role="filter-brand-search"></label>' +
      '<div class="brand-grid">' + (group.options || []).map((option) => {
        const selected = (draft.brand || []).some((v) => String(v) === String(option.id) || String(v) === String(option.name));
        const logo = option.logo ? '<img src="' + safeImage(option.logo) + '" alt="">' : '<span class="brand-initial">' + escapeHtml(String(option.name || "?").slice(0, 1)) + "</span>";
        return '<label class="brand-opt' + (selected ? " selected" : "") + '" data-brand-name="' + escapeHtml(String(option.name).toLowerCase()) + '">' +
          '<input type="checkbox" data-filter-kind="brand" value="' + escapeHtml(option.id) + '"' + (selected ? " checked" : "") + ">" +
          logo + '<span class="brand-opt-name">' + escapeHtml(option.name) + '</span><small>' + Number(option.count || 0) + "</small></label>";
      }).join("") + "</div>";
  }
  if (group.key === "price") {
    return '<div class="price-range"><div class="field-row"><input class="input" type="number" min="0" placeholder="Min" data-filter-price="min" value="' + escapeHtml(draft.minPrice) + '"><input class="input" type="number" min="0" placeholder="Max" data-filter-price="max" value="' + escapeHtml(draft.maxPrice) + '"></div>' +
      '<div class="price-scale"><span>\u20B9' + Number(group.min || 0) + "</span><span>\u20B9" + Number(group.max || 0) + "+</span></div></div>" +
      '<div class="fopt-list">' + (group.options || []).map((option) =>
        '<button type="button" class="fopt preset" data-action="filter-price-preset" data-min="' + escapeHtml(option.min) + '" data-max="' + escapeHtml(option.max == null ? "" : option.max) + '"><span>' + escapeHtml(option.name) + '</span><small>' + Number(option.count || 0) + "</small></button>"
      ).join("") + "</div>";
  }
  if (group.key === "rating" || group.key === "discount") {
    const selected = group.key === "rating" ? draft.rating : draft.discount;
    return '<div class="fopt-list"><label class="fopt"><input type="radio" name="f-' + group.key + '" data-filter-kind="' + group.key + '" value=""' + (!selected ? " checked" : "") + '><span>Any</span></label>' +
      (group.options || []).map((option) =>
        '<label class="fopt"><input type="radio" name="f-' + group.key + '" data-filter-kind="' + group.key + '" value="' + escapeHtml(option.value) + '"' + (String(selected) === String(option.value) ? " checked" : "") + '><span>' + escapeHtml(option.name) + '</span><small>' + Number(option.count || 0) + "</small></label>"
      ).join("") + "</div>";
  }
  if (group.key === "new_arrivals") {
    const option = (group.options || [])[0] || { name: group.label, count: 0 };
    return '<label class="fopt toggle"><input type="checkbox" data-filter-kind="newArrival"' + (draft.newArrival ? " checked" : "") + '><span>' + escapeHtml(option.name) + '</span><small>' + Number(option.count || 0) + "</small></label>";
  }
  if (group.key === "color") {
    return '<label class="filter-search"><span aria-hidden="true">\u{1F50D}</span><input type="search" placeholder="Search" data-role="filter-color-search" autocomplete="off"></label>' +
      '<div class="fopt-list color-list" data-role="filter-color-list">' +
      (group.options || []).map((option) => {
        const selected = (draft.color || []).some((v) => String(v) === String(option.id) || String(v) === String(option.value) || String(v) === String(option.name));
        const swatch = option.hex || "var(--border-color)";
        return '<label class="fopt color-opt" data-color-name="' + escapeHtml(String(option.name || "").toLowerCase()) + '">' +
          '<input type="checkbox" data-filter-kind="color" value="' + escapeHtml(option.id || option.value) + '"' + (selected ? " checked" : "") + ">" +
          '<span class="filter-swatch" style="background:' + escapeHtml(swatch) + '"></span>' +
          '<span class="color-name">' + escapeHtml(option.name) + "</span>" +
          '<small class="color-count">' + Number(option.count || 0) + "</small></label>";
      }).join("") + "</div>" +
      '<p class="filter-empty" data-role="filter-color-empty" hidden>No colours found</p>';
  }
  return '<div class="fopt-list">' + (group.options || []).map((option) => {
    const selected = (draft[group.key] || []).some((v) => String(v) === String(option.id) || String(v) === String(option.value) || String(v) === String(option.name));
    const swatch = option.hex ? '<span class="filter-swatch" style="background:' + escapeHtml(option.hex) + '"></span>' : "";
    return '<label class="fopt"><input type="checkbox" data-filter-kind="' + escapeHtml(group.key) + '" value="' + escapeHtml(option.id || option.value) + '"' + (selected ? " checked" : "") + ">" + swatch +
      '<span>' + escapeHtml(option.name) + '</span><small>' + Number(option.count || 0) + "</small></label>";
  }).join("") + "</div>";
}

function renderFilterPanel() {
  const host = $("#filter-panel-root");
  const filterData = state.filterData;
  if (!host || !filterData) return;
  const draft = state.filterDraft;
  const groups = filterData.groups || [];
  if (!groups.length) {
    host.innerHTML = '<div class="filter-screen"><div class="filter-screen-head"><button class="filter-close" data-action="close-filters" aria-label="Close">\u00D7</button><div><h2>Filters</h2><p>No filter groups are enabled.</p></div><span></span></div></div>';
    return;
  }
  if (!groups.some((g) => g.key === state.filterGroup)) state.filterGroup = groups[0].key;
  const nav = groups.map((group) => {
    const count = filterGroupSelectionCount(group, draft);
    return '<button type="button" class="filter-nav-item' + (group.key === state.filterGroup ? " active" : "") + '" data-action="filter-group" data-key="' + escapeHtml(group.key) + '"><span>' + escapeHtml(group.label) + '</span><b data-nav-count="' + escapeHtml(group.key) + '">' + (count || "") + "</b></button>";
  }).join("");
  const panels = groups.map((group) =>
    '<section class="filter-panel' + (group.key === state.filterGroup ? " active" : "") + '" data-panel="' + escapeHtml(group.key) + '">' +
      "<h3>" + escapeHtml(group.label) + "</h3>" + filterGroupContent(group, draft) + "</section>"
  ).join("");
  host.innerHTML = '<div class="filter-screen" data-role="filter-screen">' +
    '<div class="filter-screen-head"><button class="filter-close" data-action="close-filters" aria-label="Close">\u00D7</button>' +
    '<div><h2>Filters</h2><p><span data-role="filter-total">' + Number(filterData.total || 0) + "</span> products match</p></div>" +
    '<button type="button" class="link-btn" data-action="clear-filter-draft">Clear all</button></div>' +
    '<div class="filter-screen-body"><nav class="filter-nav">' + nav + "</nav><div class=\"filter-panels\">" + panels + "</div></div>" +
    '<div class="filter-screen-cta"><div><strong data-role="filter-total">' + Number(filterData.total || 0) + '</strong> products</div><button type="button" class="btn primary" data-action="apply-filters">See ' + Number(filterData.total || 0) + " products</button></div>" +
    "</div>";
  document.body.classList.add("filters-open");
}

async function refreshFilterTotal() {
  const draft = state.filterDraft;
  if (!draft) return;
  if (state.filterTotalTimer) clearTimeout(state.filterTotalTimer);
  state.filterTotalTimer = setTimeout(async () => {
    try {
      const params = draftToParams(draft);
      params.set("limit", "1");
      const data = await api("/api/products?" + params.toString(), { auth: false });
      const total = Number(data.total) || 0;
      $$('[data-role="filter-total"]').forEach((el) => { el.textContent = total; });
      const apply = $('[data-action="apply-filters"]');
      if (apply) apply.textContent = "See " + total + " product" + (total === 1 ? "" : "s");
    } catch (e) { /* ignore live preview errors */ }
  }, 220);
}

async function renderProducts(token, route) {
  const q = route.query;
  const params = new URLSearchParams();
  ["q", "category", "sub", "brand", "gender", "color", "size", "age_group", "offers", "minPrice", "maxPrice", "rating", "discount", "newArrival", "sort"].forEach((k) => {
    if (q[k]) params.set(k, q[k]);
  });
  const filterParams = new URLSearchParams(params.toString());
  params.set("limit", "60");
  const [catsRes, filterRes, data] = await Promise.all([
    api("/api/categories", { auth: false }).catch(() => ({ categories: [] })),
    api("/api/filters?" + filterParams.toString(), { auth: false }).catch(() => ({ total: 0, groups: [] })),
    api("/api/products?" + params.toString(), { auth: false }),
  ]);
  if (token !== renderToken) return;
  state.categories = catsRes.categories || [];
  state.filterData = filterRes || { total: 0, groups: [] };
  state.filterDraft = draftFromQuery(q);
  normalizeDraftIds(state.filterData, state.filterDraft);
  state.filterGroup = "sort";
  state.listing = {
    base: params.toString(),
    page: 1,
    total: Number(data.total) || 0,
    loaded: (data.products || []).length,
    loading: false,
  };

  const draft = state.filterDraft;
  const selectedCount = (state.filterData.groups || []).reduce((sum, group) => sum + filterGroupSelectionCount(group, draft), 0);
  const chips = activeFilterChips(state.filterData, draft);
  const sortValue = q.sort || "popularity";
  const sortOptions = [
    ["popularity", "Popularity"], ["price-asc", "Price: Low to High"], ["price-desc", "Price: High to Low"],
    ["newest", "Newest First"], ["discount", "Discount"], ["rating", "Rating"],
  ].map(([v, l]) => '<option value="' + v + '"' + (sortValue === v ? " selected" : "") + ">" + l + "</option>").join("");
  const title = q.category ? escapeHtml(q.category) : "All Products";
  const pageIntro = q.q ? "" :
    '<div class="crumbs"><a href="#/">Home</a> \u203A ' + title + "</div>" +
    '<div class="page-head"><h1>' + title + '</h1><span class="muted small">' + data.total + " products</span></div>";

  const html =
    pageIntro +
    '<div class="active-filters">' + chips.join("") + "</div>" +
    '<div class="listing-tools' + (q.q ? " search-results-tools" : "") + '">' +
      '<button type="button" class="btn secondary filter-trigger" data-action="open-filters">\u2699 Filters' + (selectedCount ? ' <span class="filter-badge">' + selectedCount + "</span>" : "") + "</button>" +
      '<label class="sort-inline"><span class="muted small">Sort</span><select class="input" data-quick-sort>' + sortOptions + "</select></label>" +
    "</div>" +
    '<div class="listing">' +
      '<div>' +
        (data.products.length
          ? '<div id="product-grid" class="product-grid">' + data.products.map(productCard).join("") + "</div>" +
            (state.listing.loaded < state.listing.total
              ? '<div class="center" id="load-more-wrap" style="margin-top:16px"><button class="btn secondary" data-action="load-more">Load more products</button></div>'
              : "")
          : emptyView("\u{1F50E}", "No products found", "Try changing your filters or search keywords.", "#/products", "Clear filters")) +
      "</div>" +
    "</div>" +
    '<div id="filter-panel-root"></div>';

  $("#app").innerHTML = html;
}

function updateFilterNavCounts() {
  const draft = state.filterDraft;
  const filterData = state.filterData;
  if (!draft || !filterData) return;
  (filterData.groups || []).forEach((group) => {
    const el = $('[data-nav-count="' + group.key + '"]');
    if (el) el.textContent = filterGroupSelectionCount(group, draft) || "";
    const nav = $('.filter-nav-item[data-key="' + group.key + '"]');
    if (nav) nav.classList.toggle("has-selection", filterGroupSelectionCount(group, draft) > 0);
  });
  refreshFilterTotal();
}

function selectFilterGroup(key) {
  if (!key) return;
  state.filterGroup = key;
  $$(".filter-nav-item").forEach((el) => el.classList.toggle("active", el.dataset.key === key));
  $$(".filter-panel").forEach((el) => el.classList.toggle("active", el.dataset.panel === key));
}

function openFilters() {
  if (!state.filterDraft) return;
  renderFilterPanel();
}

function closeFilters() {
  document.body.classList.remove("filters-open");
  const host = $("#filter-panel-root");
  if (host) host.innerHTML = "";
}

function applyFilters() {
  const draft = state.filterDraft;
  if (!draft) return;
  const params = draftToParams(draft);
  closeFilters();
  go("/products" + (params.toString() ? "?" + params.toString() : ""));
}

function syncFilterDraftFromInput(input) {
  const draft = state.filterDraft;
  if (!draft) return;
  const kind = input.dataset.filterKind;
  if (!kind) return;
  if (kind === "newArrival") draft.newArrival = input.checked;
  else if (kind === "sort") draft.sort = input.value || "popularity";
  else if (input.type === "radio") draft[kind] = input.value;
  else {
    const list = draft[kind] || [];
    const value = input.value;
    draft[kind] = input.checked ? list.concat([value]) : list.filter((v) => String(v) !== String(value));
  }
  const optionRow = input.closest(".brand-opt, .color-opt");
  if (optionRow) optionRow.classList.toggle("selected", input.checked);
  updateFilterNavCounts();
}

function syncFilterPrice(input) {
  const draft = state.filterDraft;
  if (!draft) return;
  const which = input.dataset.filterPrice;
  if (which === "min") draft.minPrice = input.value;
  if (which === "max") draft.maxPrice = input.value;
  updateFilterNavCounts();
}

function clearFilterDraft() {
  const draft = state.filterDraft;
  if (!draft) return;
  state.filterDraft = {
    q: draft.q,
    category: draft.category,
    sub: draft.sub,
    sort: "popularity",
    brand: [], gender: [], color: [], size: [], age_group: [], offers: [],
    minPrice: "", maxPrice: "", rating: "", discount: "",
    newArrival: false,
  };
  renderFilterPanel();
  refreshFilterTotal();
}

/* ---------------------------------------------------------------------------
   Product detail
   --------------------------------------------------------------------------- */
async function renderProduct(token, id) {
  const p = await api("/api/products/" + encodeURIComponent(id), { auth: false });
  if (token !== renderToken) return;
  setMeta(p.title, p.description || ("Buy " + p.title + " at Aamart."));

  state.pd = { productId: p.id, variant: p.variants && p.variants.length ? p.variants[0].value : "", qty: 1, imageIndex: 0 };
  state.reviewRating = 5;

  const idx = state.recentlyViewed.indexOf(p.id);
  if (idx >= 0) state.recentlyViewed.splice(idx, 1);
  state.recentlyViewed.unshift(p.id);
  state.recentlyViewed = state.recentlyViewed.slice(0, 12);
  localStorage.setItem("aamart_recent", JSON.stringify(state.recentlyViewed));

  const inWish = state.wishlist.has(p.id);
  const stockClass = p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "in";
  const stockText = p.stock <= 0 ? t("outOfStock") : p.stock <= 5 ? t("lowStock") + " (" + p.stock + " left)" : t("inStock");

  const variantGroups = {};
  (p.variants || []).forEach((v) => {
    if (!variantGroups[v.type]) variantGroups[v.type] = [];
    variantGroups[v.type].push(v);
  });
  const variantHtml = Object.keys(variantGroups).map((type) =>
    '<div class="pd-variants"><div class="variant-label">' + escapeHtml(type) + '</div><div class="variant-options" data-variant-type="' + escapeHtml(type) + '">' +
    variantGroups[type].map((v) => '<button class="variant-option' + (v.value === state.pd.variant ? " active" : "") + '" data-action="variant" data-type="' + escapeHtml(type) + '" data-value="' + escapeHtml(v.value) + '" data-price="' + Number(v.price || p.price) + '">' + escapeHtml(v.value) + (v.price && v.price !== p.price ? " \u00B7 " + money(v.price) : "") + "</button>").join("") +
    "</div></div>"
  ).join("");

  const thumbs = (p.images || []).map((src, i) =>
    '<button data-action="thumb" data-index="' + i + '" class="' + (i === 0 ? "active" : "") + '"><img src="' + safeImage(src) + '" alt="' + escapeHtml(p.title) + " image " + (i + 1) + '"></button>'
  ).join("");

  const specs = Object.entries(p.specs || {});
  const specsHtml = specs.length
    ? '<table class="spec-table">' + specs.map(([k, v]) => "<tr><td>" + escapeHtml(k) + "</td><td>" + escapeHtml(v) + "</td></tr>").join("") + "</table>"
    : '<p class="muted small">No specifications available.</p>';

  const reviews = p.reviews || [];
  const reviewHtml = reviews.length
    ? reviews.map((r) => '<div class="review"><div class="r-head"><span class="r-name">' + escapeHtml(r.name) + '</span><span class="stars">' + stars(r.rating) + '</span><span class="r-date">' + new Date(r.created_at).toLocaleDateString("en-IN") + "</span></div>" +
        (r.title ? '<div class="r-title">' + escapeHtml(r.title) + "</div>" : "") +
        '<div class="r-body">' + escapeHtml(r.body) + "</div></div>").join("")
    : '<p class="muted small">No reviews yet. Be the first to review this product.</p>';

  const html =
    '<div class="crumbs"><a href="#/">Home</a> \u203A <a href="#/products?category=' + encodeURIComponent(p.category) + '">' + escapeHtml(p.category) + '</a> \u203A ' + escapeHtml(p.sub) + "</div>" +
    '<div class="pd">' +
      '<div class="pd-gallery">' +
        '<img id="pd-main-img" class="pd-main-img" src="' + safeImage(p.images[0]) + '" alt="' + escapeHtml(p.title) + '">' +
        '<div class="pd-thumbs">' + thumbs + "</div>" +
      "</div>" +
      '<div class="pd-info">' +
        '<div class="pd-brand">' + escapeHtml(p.brand || "Aamart") + "</div>" +
        '<h1 class="pd-title">' + escapeHtml(p.title) + "</h1>" +
        '<div class="pd-rating"><span class="rating-pill">' + Number(p.rating || 0).toFixed(1) + ' \u2605</span><span class="muted small">' + (p.ratingCount || 0) + " ratings</span>" +
          (p.stock > 0 ? '<span class="pc-stock in small">\u2713 ' + t("inStock") + "</span>" : '<span class="pc-stock out small">' + t("outOfStock") + "</span>") + "</div>" +
        '<div class="pd-price"><span class="now" id="pd-price-now">' + money(p.price) + '</span>' +
          (p.mrp > p.price ? '<span class="mrp">' + money(p.mrp) + "</span>" : "") +
          (p.discount > 0 ? '<span class="off">' + p.discount + "% off</span>" : "") + "</div>" +
        '<div class="muted small">Inclusive of all taxes \u00B7 SKU: ' + escapeHtml(p.sku || "-") + "</div>" +
        variantHtml +
        '<div class="row" style="gap:14px;align-items:center;margin-top:10px"><div class="variant-label" style="margin:0">Quantity</div><div class="qty"><button data-action="qty-detail-dec">\u2212</button><span id="pd-qty">1</span><button data-action="qty-detail-inc">+</button></div><span class="pc-stock ' + stockClass + ' small">' + stockText + "</span></div>" +
        '<div class="pd-buy">' +
          (p.stock > 0
            ? '<button class="btn secondary" data-action="add-cart-detail">' + t("addToCart") + '</button><button class="btn" data-action="buy-now">' + t("buyNow") + "</button>"
            : '<button class="btn ghost" disabled>Out of stock</button>') +
        "</div>" +
        '<button class="btn ghost block" style="margin-top:9px" data-action="wishlist" data-id="' + p.id + '">' + (inWish ? "\u2665 Remove from Wishlist" : "\u2661 Add to Wishlist") + "</button>" +
        '<div class="pd-meta">' +
          '<div>\u{1F69A} Free delivery on orders above ' + money(state.settings ? state.settings.freeDeliveryAbove : 499) + "</div>" +
          '<div>\u21A9\uFE0F 7-day easy returns</div>' +
          '<div>\u{1F512} Secure payments \u00B7 COD available</div>' +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div class="pd-section"><h2 style="font-size:16px;font-weight:800">Product Description</h2><p class="muted" style="font-size:14px">' + escapeHtml(p.description || "No description available.") + "</p></div>" +
    '<div class="pd-section"><h2 style="font-size:16px;font-weight:800">Specifications</h2>' + specsHtml + "</div>" +
    '<div class="pd-section"><div class="row between"><h2 style="font-size:16px;font-weight:800">Ratings & Reviews</h2><span class="muted small">' + reviews.length + " reviews</span></div>" + reviewHtml +
      '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">' +
        '<h3 style="font-size:14px;font-weight:800">Write a review</h3>' +
        (isLoggedIn()
          ? '<form data-form="review" data-product-id="' + p.id + '"><div class="rating-input" id="rating-input">' +
              [1, 2, 3, 4, 5].map((n) => '<button type="button" data-action="set-rating" data-rating="' + n + '" class="active">\u2605</button>').join("") +
            '</div><div class="field" style="margin-top:8px"><input class="input" name="title" placeholder="Review title (optional)" maxlength="100"></div>' +
            '<div class="field"><textarea class="input" name="body" placeholder="Share your experience with this product" maxlength="1000"></textarea></div>' +
            '<button class="btn" type="submit">Submit Review</button></form>'
          : '<p class="muted small">Please <a class="link" href="#/login">login</a> to write a review.</p>') +
      "</div>" +
    "</div>" +
    (p.related && p.related.length ? '<div class="section">' + sectionHead("Related Products", "") + productRail(p.related) + "</div>" : "");

  $("#app").innerHTML = html;
  const ratingButtons = $$("#rating-input button");
  ratingButtons.forEach((b) => b.classList.toggle("active", Number(b.dataset.rating) <= state.reviewRating));
}

/* ---------------------------------------------------------------------------
   Cart
   --------------------------------------------------------------------------- */
function computeLocalTotals(itemTotal, coupon) {
  const s = state.settings || { deliveryCharge: 49, freeDeliveryAbove: 499, taxPercent: 0 };
  let discount = 0;
  if (coupon) {
    discount = coupon.type === "percent" ? (itemTotal * coupon.value) / 100 : coupon.value;
    if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
    discount = Math.min(discount, itemTotal);
  }
  const after = Math.max(0, itemTotal - discount);
  const freeAbove = Number(s.freeDeliveryAbove || 0);
  const delivery = itemTotal > 0 && (freeAbove === 0 || after >= freeAbove) ? 0 : Number(s.deliveryCharge || 0);
  const tax = Math.round((after * Number(s.taxPercent || 0)) / 100 * 100) / 100;
  return { itemTotal, discount, delivery, tax, payable: Math.round((after + delivery + tax) * 100) / 100 };
}

async function renderCart(token) {
  if (!requireAuth("/cart")) return;
  const [cart, settings] = await Promise.all([api("/api/cart"), api("/api/settings", { auth: false })]);
  if (token !== renderToken) return;
  state.settings = settings;
  state.cartCount = cart.count;
  updateChrome(state.route);

  if (!cart.items.length && !cart.saved.length) {
    $("#app").innerHTML = '<div class="page-head"><h1>' + t("cart") + "</h1></div>" +
      emptyView("\u{1F6D2}", t("emptyCart"), "Add products you love and they will show up here.", "#/", "Start Shopping");
    return;
  }

  const coupon = state.appliedCoupon;
  const totals = computeLocalTotals(cart.itemTotal, coupon);

  const itemHtml = cart.items.map((it) =>
    '<div class="cart-item">' +
      '<a href="#/product/' + it.productId + '"><img src="' + escapeHtml(it.image) + '" alt="' + escapeHtml(it.name) + '"></a>' +
      '<div><a class="ci-title" href="#/product/' + it.productId + '">' + escapeHtml(it.name) + "</a>" +
        (it.variant ? '<div class="ci-meta">Variant: ' + escapeHtml(it.variant) + "</div>" : "") +
        '<div class="ci-meta">' + money(it.price) + " each</div>" +
        '<div class="ci-price">' + money(it.lineTotal) + "</div>" +
        '<div class="ci-controls"><div class="qty"><button data-action="cart-dec" data-id="' + it.id + '">\u2212</button><span>' + it.qty + '</span><button data-action="cart-inc" data-id="' + it.id + '">+</button></div>' +
          '<button class="link" data-action="save-later" data-id="' + it.id + '">Save for later</button>' +
          '<button class="link" data-action="remove-cart" data-id="' + it.id + '" style="color:var(--red)">Remove</button>' +
        "</div>" +
      "</div>" +
    "</div>"
  ).join("");

  const savedHtml = cart.saved.length
    ? '<div class="saved-head">Saved for later (' + cart.saved.length + ")</div>" + cart.saved.map((it) =>
        '<div class="cart-item"><a href="#/product/' + it.productId + '"><img src="' + escapeHtml(it.image) + '" alt="' + escapeHtml(it.name) + '"></a>' +
        '<div><a class="ci-title" href="#/product/' + it.productId + '">' + escapeHtml(it.name) + "</a>" +
          '<div class="ci-meta">' + money(it.price) + "</div>" +
          '<div class="ci-controls"><button class="link" data-action="move-cart" data-id="' + it.id + '">Move to cart</button>' +
          '<button class="link" data-action="remove-cart" data-id="' + it.id + '" style="color:var(--red)">Remove</button></div></div></div>'
      ).join("")
    : "";

  const summary =
    '<div class="card summary"><div class="card-title">Price Details</div>' +
      '<div class="sum-row"><span>' + t("itemTotal") + "</span><span>" + money(totals.itemTotal) + "</span></div>" +
      (totals.discount > 0 ? '<div class="sum-row"><span>' + t("discount") + (coupon ? " (" + escapeHtml(coupon.code) + ")" : "") + '</span><span style="color:var(--green)">\u2212' + money(totals.discount) + "</span></div>" : "") +
      '<div class="sum-row"><span>' + t("delivery") + "</span><span>" + (totals.delivery === 0 ? '<span class="free">' + t("free") + "</span>" : money(totals.delivery)) + "</span></div>" +
      '<div class="sum-row"><span>' + t("tax") + "</span><span>" + money(totals.tax) + "</span></div>" +
      '<div class="sum-row total"><span>' + t("total") + "</span><span>" + money(totals.payable) + "</span></div>" +
      '<form data-form="coupon" style="margin-top:10px">' +
        (coupon
          ? '<div class="row between" style="background:var(--green-soft);padding:8px 10px;border-radius:9px"><span class="small" style="font-weight:700;color:var(--green)">\u2713 ' + escapeHtml(coupon.code) + ' applied</span><button type="button" class="link" data-action="remove-coupon">Remove</button></div>'
          : '<div class="coupon-row"><input class="input" name="code" placeholder="Enter coupon code" maxlength="30"><button class="btn" type="submit">' + t("apply") + "</button></div>") +
      "</form>" +
      '<button class="btn block" style="margin-top:10px" data-action="go-checkout">' + t("proceed") + "</button>" +
      '<p class="muted small center" style="margin-top:8px">\u{1F512} Safe and secure payments</p>' +
    "</div>";

  $("#app").innerHTML = '<div class="page-head"><h1>' + t("cart") + ' <span class="muted small">(' + cart.count + " items)</span></h1></div>" +
    '<div class="cart-layout"><div class="card">' + itemHtml + savedHtml + "</div>" + summary + "</div>";
}

/* ---------------------------------------------------------------------------
   Checkout
   --------------------------------------------------------------------------- */
async function renderCheckout(token) {
  if (!requireAuth("/checkout")) return;
  const [cart, addrRes, settings] = await Promise.all([api("/api/cart"), api("/api/addresses"), api("/api/settings", { auth: false })]);
  if (token !== renderToken) return;
  state.settings = settings;
  if (!cart.items.length) {
    $("#app").innerHTML = '<div class="page-head"><h1>Checkout</h1></div>' + emptyView("\u{1F6D2}", t("emptyCart"), "Add items to your cart before checkout.", "#/", "Shop Now");
    return;
  }
  const addresses = addrRes.addresses || [];
  const addressId = state.checkout.addressId || (addresses.find((a) => a.is_default) || addresses[0] || {}).id || null;
  state.checkout.addressId = addressId;
  const methods = settings.paymentMethods || {};
  const enabled = Object.keys(methods).filter((m) => methods[m]);
  const payment = state.checkout.payment && methods[state.checkout.payment] ? state.checkout.payment : (enabled[0] || "COD");
  state.checkout.payment = payment;

  const coupon = state.appliedCoupon;
  const totals = computeLocalTotals(cart.itemTotal, coupon);

  const addressHtml = addresses.length
    ? addresses.map((a) =>
        '<label class="addr-option' + (a.id === addressId ? " selected" : "") + '">' +
          '<input type="radio" name="address" value="' + a.id + '"' + (a.id === addressId ? " checked" : "") + ' data-action="select-address" data-id="' + a.id + '">' +
          '<div><div class="a-name">' + escapeHtml(a.name) + ' <span class="a-tag">' + escapeHtml(a.type || "Home") + "</span></div>" +
            '<div class="a-line">' + escapeHtml(a.line1) + (a.line2 ? ", " + escapeHtml(a.line2) : "") + "</div>" +
            '<div class="a-line">' + escapeHtml(a.city) + ", " + escapeHtml(a.state) + " - " + escapeHtml(a.pincode) + "</div>" +
            '<div class="a-line">Phone: ' + escapeHtml(a.phone) + "</div></div>" +
        "</label>"
      ).join("")
    : '<p class="muted small">No saved address. Please add a delivery address.</p>';

  const payMeta = {
    COD: ["Cash on Delivery", "Pay when your order arrives"],
    UPI: ["UPI", "Google Pay, PhonePe, Paytm and more"],
    Card: ["Credit / Debit Card", "Visa, Mastercard, RuPay"],
    "Net Banking": ["Net Banking", "All major banks supported"],
    Wallet: ["Wallet", "Pay using your wallet balance"],
  };
  const paymentHtml = enabled.map((m) =>
    '<label class="pay-option' + (m === payment ? " selected" : "") + '">' +
      '<input type="radio" name="payment" value="' + escapeHtml(m) + '"' + (m === payment ? " checked" : "") + ' data-action="select-payment" data-method="' + escapeHtml(m) + '">' +
      '<div><div class="p-name">' + escapeHtml(payMeta[m] ? payMeta[m][0] : m) + '</div><div class="p-desc">' + escapeHtml(payMeta[m] ? payMeta[m][1] : "") + "</div></div>" +
    "</label>"
  ).join("");

  const summary =
    '<div class="card summary"><div class="card-title">Order Summary</div>' +
      cart.items.map((it) => '<div class="sum-row"><span class="small">' + escapeHtml(it.name) + " \u00D7 " + it.qty + "</span><span>" + money(it.lineTotal) + "</span></div>").join("") +
      '<div class="sum-row" style="border-top:1px dashed var(--border);margin-top:6px;padding-top:8px"><span>' + t("itemTotal") + "</span><span>" + money(totals.itemTotal) + "</span></div>" +
      (totals.discount > 0 ? '<div class="sum-row"><span>' + t("discount") + '</span><span style="color:var(--green)">\u2212' + money(totals.discount) + "</span></div>" : "") +
      '<div class="sum-row"><span>' + t("delivery") + "</span><span>" + (totals.delivery === 0 ? '<span class="free">' + t("free") + "</span>" : money(totals.delivery)) + "</span></div>" +
      '<div class="sum-row"><span>' + t("tax") + "</span><span>" + money(totals.tax) + "</span></div>" +
      '<div class="sum-row total"><span>' + t("total") + "</span><span>" + money(totals.payable) + "</span></div>" +
      '<button class="btn block" style="margin-top:12px" data-action="place-order">' + t("placeOrder") + "</button>" +
      '<p class="muted small center" style="margin-top:8px">By placing this order you agree to our terms.</p>' +
    "</div>";

  $("#app").innerHTML =
    '<div class="page-head"><h1>Checkout</h1></div>' +
    '<div class="steps"><div class="step active">1. Address</div><div class="step active">2. Payment</div><div class="step">3. Confirm</div></div>' +
    '<div class="checkout-layout">' +
      '<div>' +
        '<div class="card"><div class="card-title">Delivery Address <button class="btn small secondary" data-action="open-address">+ Add New</button></div>' + addressHtml + "</div>" +
        '<div class="card"><div class="card-title">Payment Method</div>' + (paymentHtml || '<p class="muted small">No payment methods available. Please contact support.</p>') + "</div>" +
      "</div>" +
      summary +
    "</div>";
}

/* ---------------------------------------------------------------------------
   Orders
   --------------------------------------------------------------------------- */
function orderCard(o) {
  return '<div class="order-card">' +
    '<div class="order-head"><div><div class="o-no">Order #' + escapeHtml(o.orderNo) + '</div><div class="o-date">' + new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) + "</div></div>" +
      '<span class="status ' + statusClass(o.status) + '">' + escapeHtml(o.status) + "</span></div>" +
    '<div class="order-body"><div class="order-items-mini">' +
      o.items.slice(0, 6).map((it) => '<img src="' + escapeHtml(it.image || "/img/placeholder.svg") + '" alt="' + escapeHtml(it.name) + '" title="' + escapeHtml(it.name) + '">').join("") +
      (o.items.length > 6 ? '<span class="muted small" style="align-self:center">+' + (o.items.length - 6) + " more</span>" : "") +
    "</div></div>" +
    '<div class="order-foot"><div><span class="muted small">' + o.items.reduce((s, i) => s + i.qty, 0) + " item(s) \u00B7 </span><strong>" + money(o.payable) + "</strong></div>" +
      '<div class="row" style="gap:8px"><a class="btn small secondary" href="#/order/' + o.id + '">View Details</a>' +
      (["Ordered", "Packed"].includes(o.status) ? '<button class="btn small ghost" data-action="cancel-order" data-id="' + o.id + '">Cancel</button>' : "") +
      "</div></div>" +
  "</div>";
}

function matchesOrderFilter(order, filter) {
  const def = ORDER_FILTERS[filter] || ORDER_FILTERS.all;
  return !def.statuses || def.statuses.includes(order.status);
}

async function renderOrders(token, route) {
  if (!requireAuth("/orders")) return;
  const data = await api("/api/orders");
  if (token !== renderToken) return;
  const orders = data.orders || [];
  const filter = route && route.query && ORDER_FILTERS[route.query.filter] ? route.query.filter : "all";
  const visible = orders.filter((o) => matchesOrderFilter(o, filter));
  const filters = Object.keys(ORDER_FILTERS).map((key) => {
    const def = ORDER_FILTERS[key];
    const href = key === "all" ? "#/orders" : "#/orders?filter=" + encodeURIComponent(key);
    return '<a class="order-filter' + (key === filter ? " active" : "") + '" href="' + href + '">' + escapeHtml(def.label) + "</a>";
  }).join("");
  const body = visible.length
    ? visible.map(orderCard).join("")
    : emptyView(icon("package"), "No orders in this view", "Try another order filter to see your purchases.", "#/orders", "View All Orders");
  $("#app").innerHTML = '<div class="page-head"><h1>' + t("orders") + "</h1></div>" +
    (orders.length ? '<div class="order-filters">' + filters + "</div>" : "") + body;
}

async function renderOrder(token, id) {
  if (!requireAuth("/order/" + id)) return;
  const o = await api("/api/orders/" + encodeURIComponent(id));
  if (token !== renderToken) return;

  const flow = ["Ordered", "Packed", "Shipped", "Out for Delivery", "Delivered"];
  const currentIndex = flow.indexOf(o.status);
  const cancelled = o.status === "Cancelled";
  const historyMap = {};
  (o.history || []).forEach((h) => { historyMap[h.status] = h; });

  const timeline = flow.map((s, i) => {
    const done = !cancelled && i < currentIndex;
    const current = !cancelled && i === currentIndex;
    const h = historyMap[s];
    return '<div class="tl-step ' + (done ? "done" : "") + (current ? " current" : "") + '"><div class="tl-dot"></div><div><div class="tl-status">' + s + "</div>" +
      '<div class="tl-time">' + (h ? new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : (i <= currentIndex ? "" : "Pending")) + "</div></div></div>";
  }).join("");
  const cancelStep = cancelled
    ? '<div class="tl-step current"><div class="tl-dot" style="background:var(--red);box-shadow:0 0 0 1.5px var(--red)"></div><div><div class="tl-status">Cancelled</div><div class="tl-time">' + (historyMap.Cancelled ? new Date(historyMap.Cancelled.at).toLocaleString("en-IN") : "") + "</div></div></div>"
    : "";

  const addr = o.address || {};
  $("#app").innerHTML =
    '<div class="crumbs"><a href="#/orders">' + t("orders") + "</a> \u203A " + escapeHtml(o.orderNo) + "</div>" +
    '<div class="page-head"><h1>Order #' + escapeHtml(o.orderNo) + '</h1><span class="status ' + statusClass(o.status) + '">' + escapeHtml(o.status) + "</span></div>" +
    '<div class="card"><div class="card-title">Tracking</div><div class="timeline">' + timeline + cancelStep + "</div></div>" +
    '<div class="card"><div class="card-title">Items (' + o.items.length + ")</div>" +
      o.items.map((it) => '<div class="cart-item"><img src="' + safeImage(it.image || "/img/placeholder.svg") + '" alt="' + escapeHtml(it.name) + '">' +
        '<div><a class="ci-title" href="#/product/' + it.productId + '">' + escapeHtml(it.name) + "</a>" +
        (it.variant ? '<div class="ci-meta">' + escapeHtml(it.variant) + "</div>" : "") +
        '<div class="ci-meta">Qty: ' + it.qty + " \u00D7 " + money(it.price) + '</div><div class="ci-price">' + money(it.price * it.qty) + "</div></div></div>").join("") +
    "</div>" +
    '<div class="card"><div class="card-title">Delivery Address</div><div class="small">' +
      "<strong>" + escapeHtml(addr.name || o.customer.name) + "</strong><br>" +
      escapeHtml(addr.line1 || "") + (addr.line2 ? ", " + escapeHtml(addr.line2) : "") + "<br>" +
      escapeHtml(addr.city || "") + ", " + escapeHtml(addr.state || "") + " - " + escapeHtml(addr.pincode || "") + "<br>" +
      "Phone: " + escapeHtml(addr.phone || o.customer.phone) + "</div></div>" +
    '<div class="card"><div class="card-title">Payment & Summary</div>' +
      '<div class="sum-row"><span>Payment method</span><span>' + escapeHtml(o.payment.method) + " (" + escapeHtml(o.payment.status) + ")</span></div>" +
      '<div class="sum-row"><span>' + t("itemTotal") + "</span><span>" + money(o.itemTotal) + "</span></div>" +
      (o.discount > 0 ? '<div class="sum-row"><span>' + t("discount") + (o.couponCode ? " (" + escapeHtml(o.couponCode) + ")" : "") + '</span><span style="color:var(--green)">\u2212' + money(o.discount) + "</span></div>" : "") +
      '<div class="sum-row"><span>' + t("delivery") + "</span><span>" + (o.deliveryCharge === 0 ? '<span class="free">' + t("free") + "</span>" : money(o.deliveryCharge)) + "</span></div>" +
      '<div class="sum-row"><span>' + t("tax") + "</span><span>" + money(o.tax) + "</span></div>" +
      '<div class="sum-row total"><span>' + t("total") + "</span><span>" + money(o.payable) + "</span></div>" +
    "</div>" +
    (["Ordered", "Packed"].includes(o.status) ? '<button class="btn danger block" data-action="cancel-order" data-id="' + o.id + '">Cancel Order</button>' : "");
}

async function renderSuccess(token, id) {
  if (!requireAuth("/success/" + id)) return;
  const o = await api("/api/orders/" + encodeURIComponent(id));
  if (token !== renderToken) return;
  $("#app").innerHTML =
    '<div class="card center" style="max-width:560px;margin:20px auto">' +
      '<div style="font-size:56px">\u2705</div>' +
      '<h1 style="font-size:22px;font-weight:800;margin-top:8px">Order placed successfully!</h1>' +
      '<p class="muted">Thank you for shopping with Aamart. Your order has been confirmed.</p>' +
      '<div class="card" style="text-align:left;margin:14px 0;background:var(--bg-hover)">' +
        '<div class="sum-row"><span>Order ID</span><strong>' + escapeHtml(o.orderNo) + "</strong></div>" +
        '<div class="sum-row"><span>Payment</span><span>' + escapeHtml(o.payment.method) + "</span></div>" +
        '<div class="sum-row"><span>Status</span><span class="status ' + statusClass(o.status) + '">' + escapeHtml(o.status) + "</span></div>" +
        '<div class="sum-row total"><span>' + t("total") + "</span><span>" + money(o.payable) + "</span></div>" +
      "</div>" +
      '<div class="row" style="gap:9px"><a class="btn secondary" style="flex:1" href="#/orders">My Orders</a><a class="btn" style="flex:1" href="#/order/' + o.id + '">Track Order</a></div>' +
      '<a class="link" style="display:inline-block;margin-top:14px" href="#/">Continue Shopping</a>' +
    "</div>";
  refreshCart();
}

/* ---------------------------------------------------------------------------
   Account
   --------------------------------------------------------------------------- */
function accountMenuRow(item) {
  const inner =
    '<span class="acct-row-icon">' + icon(item.icon) + "</span>" +
    '<span class="acct-row-text"><strong>' + escapeHtml(item.title) + "</strong><span>" + escapeHtml(item.text) + "</span></span>" +
    icon("chevron", "acct-row-chev");
  return item.href
    ? '<a class="acct-row" href="' + item.href + '">' + inner + "</a>"
    : '<button class="acct-row" type="button" data-action="' + item.action + '">' + inner + "</button>";
}

function accountStat(count, label, filter, iconName) {
  const href = "#/orders" + (filter ? "?filter=" + encodeURIComponent(filter) : "");
  return '<a class="acct-stat" href="' + href + '">' + icon(iconName) + "<strong>" + count + "</strong><span>" + escapeHtml(label) + "</span></a>";
}

async function renderAccount(token) {
  if (!requireAuth("/account")) return;
  await refreshMe();
  const [ordersRes, recent] = await Promise.all([
    api("/api/orders"),
    loadRecentProducts(6),
  ]);
  if (token !== renderToken) return;
  const u = state.user || { name: "", email: "", phone: "" };
  const orders = ordersRes.orders || [];
  const initial = (u.name || u.email || "A").trim().charAt(0).toUpperCase();
  const counts = {
    all: orders.length,
    toShip: orders.filter((o) => matchesOrderFilter(o, "to-ship")).length,
    inTransit: orders.filter((o) => matchesOrderFilter(o, "in-transit")).length,
    delivered: orders.filter((o) => matchesOrderFilter(o, "delivered")).length,
  };
  const menu = [
    { title: "My Orders", text: "Track and manage your purchases", icon: "package", href: "#/orders" },
    { title: "Wishlist", text: "Products you saved for later", icon: "heart", href: "#/wishlist" },
    { title: "Saved Addresses", text: "Manage your delivery addresses", icon: "pin", action: "open-addresses" },
    { title: "Payments", text: "Payment methods and preferences", icon: "card", action: "open-payments" },
    { title: "Notifications", text: "Order updates and alerts", icon: "bell", action: "open-notifications" },
    { title: "Settings", text: "Profile and security settings", icon: "settings", action: "open-profile" },
    { title: "Help & Support", text: "Get help with your orders", icon: "help", href: "#/contact" },
  ];
  const recentHtml = recent.length
    ? '<div class="rail">' + recent.map(productCard).join("") + "</div>"
    : '<div class="acct-recent-empty"><span class="acct-row-icon">' + icon("clock") + '</span><div><strong>Nothing here yet</strong><p>Products you view will appear here.</p></div><a class="link" href="#/" style="margin-left:auto;font-size:12.5px;font-weight:800;flex:0 0 auto">Browse</a></div>';

  setMeta("My Account");
  $("#app").innerHTML =
    '<div class="account-page">' +
      '<div class="acct-title"><h1>My Account</h1><p>Manage your profile, orders and preferences.</p></div>' +
      '<section class="acct-hero">' +
        '<div class="acct-avatar">' + escapeHtml(initial) + "</div>" +
        '<div class="acct-hero-info">' +
          "<h2>" + escapeHtml(u.name || "Customer") + "</h2>" +
          "<p>" + escapeHtml(u.email || "") + "</p>" +
          (u.emailVerified ? '<span class="acct-verified">' + icon("check") + "Verified Account</span>" : "") +
        "</div>" +
        '<button class="acct-edit" type="button" data-action="open-profile">' + icon("pencil") + "Edit Profile" + icon("chevron") + "</button>" +
      "</section>" +
      '<section class="acct-card">' +
        '<div class="acct-card-head"><h2>Your Orders</h2><a href="#/orders">View All</a></div>' +
        '<div class="acct-stats">' +
          accountStat(counts.all, "Orders", "", "package") +
          accountStat(counts.toShip, "To Ship", "to-ship", "box") +
          accountStat(counts.inTransit, "In Transit", "in-transit", "truck") +
          accountStat(counts.delivered, "Delivered", "delivered", "check") +
        "</div>" +
      "</section>" +
      '<section class="acct-card">' +
        '<div class="acct-menu">' + menu.map(accountMenuRow).join("") + "</div>" +
        '<button class="acct-logout" type="button" data-action="logout">' + icon("logout") + "Logout</button>" +
      "</section>" +
      '<section class="acct-recent">' +
        '<div class="section-head"><h2>Recently Viewed</h2><a href="#/recent">See All \u203A</a></div>' +
        recentHtml +
      "</section>" +
    "</div>";
}

function openProfileModal() {
  const u = state.user || {};
  showModal(
    '<div class="modal-head"><h3>Edit Profile</h3><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">\u00D7</button></div>' +
    '<form data-form="profile">' +
      '<div class="field"><label>Full name</label><input class="input" name="name" value="' + escapeHtml(u.name || "") + '" required></div>' +
      '<div class="field"><label>Email address</label><input class="input" value="' + escapeHtml(u.email || "") + '" disabled></div>' +
      '<div class="field"><label>Mobile number</label><input class="input" name="phone" inputmode="numeric" maxlength="10" value="' + escapeHtml(u.phone || "") + '" required></div>' +
      '<div class="field"><label>New password (optional)</label><input class="input" type="password" name="password" minlength="10" placeholder="Leave blank to keep current password"></div>' +
      '<div class="field"><label>Current password</label><input class="input" type="password" name="currentPassword" placeholder="Required to change password"></div>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Save Changes</button></div>' +
    "</form>"
  );
}

function addressManagerCard(a) {
  return '<div class="acct-address">' +
    '<div class="acct-address-head"><strong>' + escapeHtml(a.name) + "</strong>" +
      '<span class="a-tag">' + escapeHtml(a.type || "Home") + "</span>" +
      (a.is_default ? '<span class="a-default">Default</span>' : "") +
    "</div>" +
    "<p>" + escapeHtml(a.line1) + (a.line2 ? ", " + escapeHtml(a.line2) : "") + ", " + escapeHtml(a.city) + ", " + escapeHtml(a.state) + " - " + escapeHtml(a.pincode) + "</p>" +
    "<p>Phone: " + escapeHtml(a.phone) + "</p>" +
    '<div class="row" style="gap:8px;margin-top:10px">' +
      '<button class="btn small secondary" type="button" data-action="edit-address" data-id="' + escapeHtml(a.id) + '">Edit</button>' +
      '<button class="btn small ghost" type="button" data-action="delete-address" data-id="' + escapeHtml(a.id) + '" style="color:var(--red)">Delete</button>' +
    "</div>" +
  "</div>";
}

async function openAddressManager() {
  const data = await api("/api/addresses");
  const addresses = data.addresses || [];
  showModal(
    '<div class="modal-head"><h3>Saved Addresses</h3><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">\u00D7</button></div>' +
    '<div class="acct-modal-list">' +
      (addresses.length
        ? addresses.map(addressManagerCard).join("")
        : '<div class="acct-modal-empty"><span class="acct-row-icon">' + icon("pin") + "</span><strong>No saved addresses</strong><p>Add an address for faster checkout.</p></div>") +
    "</div>" +
    '<button class="btn block" type="button" style="margin-top:12px" data-action="open-address">+ Add New Address</button>'
  );
}

function openPaymentsModal() {
  const methods = (state.settings && state.settings.paymentMethods) || {};
  const meta = {
    COD: ["Cash on Delivery", "Pay in cash when your order arrives."],
    UPI: ["UPI", "Pay using any UPI app."],
    CARD: ["Card", "Pay using a debit or credit card."],
    NETBANKING: ["Net Banking", "Pay directly from your bank account."],
  };
  const enabled = Object.keys(methods).filter((key) => methods[key]);
  const rows = enabled.length
    ? enabled.map((key) => {
        const info = meta[key] || [key, "Available at checkout."];
        return '<div class="acct-pay"><span class="acct-row-icon">' + icon("card") + "</span><div><strong>" + escapeHtml(info[0]) + "</strong><p>" + escapeHtml(info[1]) + "</p></div></div>";
      }).join("")
    : '<div class="acct-modal-empty"><span class="acct-row-icon">' + icon("card") + "</span><strong>No payment methods enabled</strong><p>Please check again later.</p></div>";
  showModal(
    '<div class="modal-head"><h3>Payment Methods</h3><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">\u00D7</button></div>' +
    '<div class="acct-modal-list">' + rows + "</div>" +
    '<p class="acct-note">Aamart does not store saved card numbers or UPI PINs. Available methods are shown at checkout.</p>'
  );
}

async function openNotificationsModal() {
  if (!state.token) {
    showToast("Please login to view notifications", "error");
    go("/login?next=/account");
    return;
  }
  const data = await api("/api/orders");
  const orders = (data.orders || []).slice(0, 8);
  const rows = orders.map((o) => {
    const statusText = o.status === "Delivered" ? "Delivered successfully"
      : o.status === "Cancelled" ? "Order cancelled"
      : "Status updated to " + o.status;
    const iconName = o.status === "Delivered" ? "check" : o.status === "Cancelled" ? "package" : "truck";
    const when = new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return '<a class="acct-notif" href="#/order/' + o.id + '">' +
      '<span class="acct-row-icon">' + icon(iconName) + "</span>" +
      '<span class="acct-notif-body"><strong>Order #' + escapeHtml(o.orderNo) + "</strong><p>" + escapeHtml(statusText) + "</p></span>" +
      "<time>" + escapeHtml(when) + "</time>" +
    "</a>";
  }).join("");
  showModal(
    '<div class="modal-head"><h3>Notifications</h3><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">\u00D7</button></div>' +
    '<div class="acct-modal-list">' +
      (orders.length
        ? rows
        : '<div class="acct-modal-empty"><span class="acct-row-icon">' + icon("bell") + "</span><strong>No notifications yet</strong><p>Order updates will appear here.</p></div>") +
    "</div>" +
    '<p class="acct-note">You will see updates here when your orders move through delivery.</p>'
  );
}

function openLogoutConfirm() {
  showModal(
    '<div class="modal-head"><h3>Logout?</h3><button class="modal-close" type="button" data-action="close-modal" aria-label="Close">\u00D7</button></div>' +
    '<p class="muted" style="margin:0 0 16px">You can sign back in anytime to view your orders and saved items.</p>' +
    '<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button type="button" class="btn danger" data-action="confirm-logout">Logout</button></div>'
  );
}

async function renderRecent(token) {
  const products = await loadRecentProducts(12);
  if (token !== renderToken) return;
  setMeta("Recently Viewed");
  $("#app").innerHTML = '<div class="page-head"><h1>Recently Viewed</h1></div>' +
    (products.length
      ? '<div class="product-grid">' + products.map(productCard).join("") + "</div>"
      : emptyView(icon("clock"), "No recently viewed products", "Products you open will appear here.", "#/", "Explore Products"));
}

async function renderWishlist(token) {
  if (!requireAuth("/wishlist")) return;
  const data = await api("/api/wishlist");
  if (token !== renderToken) return;
  state.wishlist = new Set(data.items.map((p) => p.id));
  $("#app").innerHTML = '<div class="page-head"><h1>' + t("wishlist") + ' <span class="muted small">(' + data.items.length + ")</span></h1></div>" +
    (data.items.length
      ? '<div class="product-grid">' + data.items.map(productCard).join("") + "</div>"
      : emptyView("\u2661", t("emptyWishlist"), "Save products you like and find them here anytime.", "#/", "Explore Products"));
}

/* ---------------------------------------------------------------------------
   Auth views
   --------------------------------------------------------------------------- */
function renderLogin(token, route) {
  if (isLoggedIn()) { go("/account"); return; }
  const next = route.query.next || "/";
  const otpAvailable = !!(state.settings && state.settings.otpLoginEnabled);
  const otpMode = otpAvailable && state.otpMode === "otp";
  setMeta("Login");
  const body = otpMode
    ? '<div class="field"><label>Email address</label><input class="input" name="email" type="email" value="' + escapeHtml(state.otpEmail) + '" required ' + (state.otpSent ? "readonly" : "") + '></div>' +
      (state.otpSent
        ? '<div class="field"><label>Enter OTP</label><input class="input" name="otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP" required></div>' +
          '<button class="btn block" type="submit">Verify &amp; Login</button>'
        : '<button class="btn block" type="submit">Send OTP</button>')
    : '<div class="field"><label>Email address</label><input class="input" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>' +
      '<div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password"></div>' +
      '<button class="btn block" type="submit">' + t("login") + "</button>" +
      (otpAvailable
        ? '<div class="row between" style="margin-top:10px"><button type="button" class="link small" data-action="switch-otp">Login with OTP</button><a class="link small" href="#/forgot">Forgot password?</a></div>'
        : '<div class="muted small" style="margin-top:10px">Password reset is currently unavailable. Please contact support.</div>');

  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>' + (otpMode ? "OTP Login" : "Welcome back") + "</h1>" +
      '<p class="muted small">Login to your Aamart account to continue shopping.</p>' +
      (otpAvailable
        ? '<div class="tabs"><button type="button" class="' + (!otpMode ? "active" : "") + '" data-action="login-tab" data-mode="password">Password</button><button type="button" class="' + (otpMode ? "active" : "") + '" data-action="login-tab" data-mode="otp">OTP</button></div>'
        : "") +
      '<form data-form="' + (otpMode ? (state.otpSent ? "otp-verify" : "otp-send") : "login") + '" data-next="' + escapeHtml(next) + '">' + body + "</form>" +
      '<div class="auth-alt">New to Aamart? <a href="#/register">Create an account</a></div>' +
      '<div class="auth-alt" style="margin-top:6px"><a href="#/">Continue as guest</a></div>' +
    "</div></div>";
}

function renderRegister(token, route) {
  if (isLoggedIn()) { go("/account"); return; }
  const next = route.query.next || "/";
  if (state.registerSent) {
    $("#app").innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
        '<h1>Verify your email</h1><p class="muted small">We sent a 6-digit verification code to <strong>' + escapeHtml(state.otpEmail) + '</strong>.</p>' +
        '<form data-form="register-verify" data-next="' + escapeHtml(next) + '">' +
          '<div class="field"><label>Email address</label><input class="input" name="email" type="email" value="' + escapeHtml(state.otpEmail) + '" readonly></div>' +
          '<div class="field"><label>Verification OTP</label><input class="input" name="otp" inputmode="numeric" maxlength="6" required placeholder="6-digit OTP"></div>' +
          '<button class="btn block" type="submit">Verify &amp; Create Account</button>' +
        "</form>" +
        '<div class="row between" style="margin-top:10px"><button type="button" class="link small" data-action="resend-register-otp">Resend OTP</button><button type="button" class="link small" data-action="reset-register">Change email</button></div>' +
      "</div></div>";
    return;
  }
  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Create your account</h1><p class="muted small">Join Aamart for a faster checkout experience.</p>' +
      '<form data-form="register" data-next="' + escapeHtml(next) + '">' +
        '<div class="field"><label>Full name</label><input class="input" name="name" required placeholder="Your full name"></div>' +
        '<div class="field"><label>Email address</label><input class="input" name="email" type="email" required placeholder="you@example.com"></div>' +
        '<div class="field"><label>Mobile number</label><input class="input" name="phone" inputmode="numeric" maxlength="10" required placeholder="10-digit mobile number"></div>' +
        '<div class="field"><label>Password</label><input class="input" name="password" type="password" minlength="10" required placeholder="10+ characters with upper, lower and number"></div>' +
        '<button class="btn block" type="submit">' + t("register") + "</button>" +
      "</form>" +
      '<div class="auth-alt">Already have an account? <a href="#/login">Login</a></div>' +
    "</div></div>";
}

function renderForgot(token, route) {
  setMeta("Reset Password");
  const otpAvailable = !!(state.settings && state.settings.otpLoginEnabled);
  if (!otpAvailable) {
    $("#app").innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
        '<h1>Reset password</h1><p class="muted small">Password reset is not configured yet. Please contact support to recover your account.</p>' +
        '<div class="auth-alt"><a href="#/login">Back to login</a></div>' +
      "</div></div>";
    return;
  }
  const body = state.resetSent
    ? '<div class="field"><label>Email address</label><input class="input" name="email" type="email" value="' + escapeHtml(state.otpEmail) + '" readonly></div>' +
      '<div class="field"><label>Reset OTP</label><input class="input" name="otp" inputmode="numeric" maxlength="6" required placeholder="6-digit OTP"></div>' +
      '<div class="field"><label>New password</label><input class="input" name="password" type="password" minlength="10" required placeholder="10+ characters with upper, lower and number"></div>' +
      '<button class="btn block" type="submit">Reset Password</button>'
    : '<div class="field"><label>Registered email address</label><input class="input" name="email" type="email" required placeholder="you@example.com"></div>' +
      '<button class="btn block" type="submit">Send Reset OTP</button>';
  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Reset password</h1><p class="muted small">We will send a one-time password to your email.</p>' +
      '<form data-form="' + (state.resetSent ? "reset-password" : "forgot-send") + '">' + body + "</form>" +
      '<div class="auth-alt"><a href="#/login">Back to login</a></div>' +
    "</div></div>";
}

/* ---------------------------------------------------------------------------
   Static pages
   --------------------------------------------------------------------------- */
function renderLegal(page) {
  const settings = state.settings || {};
  const contactEmail = escapeHtml(settings.supportEmail || "support@aamart.in");
  const contactPhone = escapeHtml(settings.supportPhone || "");
  const pages = {
    privacy: {
      title: "Privacy Policy",
      body: "<p>Aamart collects only the information needed to process your orders: your name, email, phone number and delivery address. We do not sell your personal data.</p>" +
        "<p>Passwords are stored as salted hashes. Payment information is never stored on our servers. You can request account deletion by contacting support.</p>",
    },
    terms: {
      title: "Terms of Service",
      body: "<p>By using Aamart you agree to provide accurate account and delivery information, and to use the store only for lawful purchases.</p>" +
        "<p>Product availability, prices and offers may change without notice. Orders may be cancelled if stock is unavailable or if fraud is suspected.</p>",
    },
    returns: {
      title: "Returns & Refunds",
      body: "<p>Most products can be returned within 7 days of delivery in unused condition with original packaging. Damaged or wrong items should be reported within 48 hours.</p>" +
        "<p>Cash on Delivery refunds are processed to a bank account or UPI ID shared by the customer after the return is approved.</p>",
    },
    contact: {
      title: "Contact Us",
      body: "<p>Need help with an order, return or your account? Our support team is here to help.</p>" +
        '<p>Email: <a class="link" href="mailto:' + contactEmail + '">' + contactEmail + "</a>" +
        (contactPhone ? "<br>Phone: " + contactPhone : "") + "</p>" +
        (settings.address ? "<p>Business address:<br>" + escapeHtml(settings.address) + "</p>" : ""),
    },
  };
  const entry = pages[page] || pages.contact;
  setMeta(entry.title);
  $("#app").innerHTML =
    '<div class="page-head"><h1>' + escapeHtml(entry.title) + "</h1></div>" +
    '<div class="card card-pad legal-page">' + entry.body + "</div>";
}

function renderNotFound() {
  setMeta("Page Not Found");
  $("#app").innerHTML = '<div class="page-head"><h1>Page not found</h1></div>' +
    emptyView("\u{1F50E}", "We couldn't find that page", "The link may be broken or the page may have moved.", "#/", "Go to Home");
}

/* ---------------------------------------------------------------------------
   Address modal
   --------------------------------------------------------------------------- */
function openAddressModal(address) {
  const a = address || {};
  showModal(
    '<div class="modal-head"><h3>' + (address ? "Edit Address" : "Add New Address") + '</h3><button class="modal-close" data-action="close-modal">\u00D7</button></div>' +
    '<form data-form="address" data-id="' + escapeHtml(a.id || "") + '">' +
      '<div class="field"><label>Full name</label><input class="input" name="name" value="' + escapeHtml(a.name || "") + '" required></div>' +
      '<div class="field"><label>Mobile number</label><input class="input" name="phone" inputmode="numeric" maxlength="10" value="' + escapeHtml(a.phone || "") + '" required></div>' +
      '<button type="button" class="btn secondary block" data-action="detect-location">Use my current location</button>' +
      '<p class="muted small" id="geo-status" style="margin:6px 0 10px">We use your location only to fill this address. You can edit it.</p>' +
      '<div class="field"><label>Address line 1</label><input class="input" name="line1" value="' + escapeHtml(a.line1 || "") + '" required placeholder="House no., street, area"></div>' +
      '<div class="field"><label>Address line 2 (optional)</label><input class="input" name="line2" value="' + escapeHtml(a.line2 || "") + '" placeholder="Landmark, apartment"></div>' +
      '<div class="field-row"><div class="field"><label>City</label><input class="input" name="city" value="' + escapeHtml(a.city || "") + '" required></div>' +
      '<div class="field"><label>State</label><input class="input" name="state" value="' + escapeHtml(a.state || "") + '" required></div></div>' +
      '<div class="field-row"><div class="field"><label>PIN code</label><input class="input" name="pincode" inputmode="numeric" maxlength="6" value="' + escapeHtml(a.pincode || "") + '" required></div>' +
      '<div class="field"><label>Address type</label><select class="input" name="type"><option' + (a.type === "Home" ? " selected" : "") + '>Home</option><option' + (a.type === "Work" ? " selected" : "") + '>Work</option><option' + (a.type === "Other" ? " selected" : "") + '>Other</option></select></div></div>' +
      '<label class="checkbox"><input type="checkbox" name="isDefault"' + (a.is_default ? " checked" : "") + '> Set as default address</label>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Save Address</button></div>' +
    "</form>"
  );
}

/* ---------------------------------------------------------------------------
   Event handling
   --------------------------------------------------------------------------- */
async function handleAction(action, el) {
  const id = el.dataset.id;

  if (action === "open-filters") { openFilters(); return; }
  if (action === "close-filters") { closeFilters(); return; }
  if (action === "filter-group") { selectFilterGroup(el.dataset.key); return; }
  if (action === "clear-filter-draft") { clearFilterDraft(); return; }
  if (action === "apply-filters") { applyFilters(); return; }
  if (action === "filter-price-preset") {
    state.filterDraft.minPrice = String(el.dataset.min || "");
    state.filterDraft.maxPrice = String(el.dataset.max || "");
    renderFilterPanel();
    refreshFilterTotal();
    return;
  }

  if (action === "detect-location") {
    const form = el.closest("form");
    if (!form) return;
    if (!navigator.geolocation) {
      showToast("Location is not supported by this browser", "error");
      return;
    }
    const status = form.querySelector("#geo-status");
    const original = el.textContent;
    el.disabled = true;
    el.textContent = "Detecting location...";
    const restore = () => { el.disabled = false; el.textContent = original; };
    const setField = (name, value) => {
      if (!value) return;
      const input = form.elements[name];
      if (input) input.value = value;
    };
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        if (status) status.textContent = "Location found. Looking up your address...";
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + encodeURIComponent(latitude) +
          "&lon=" + encodeURIComponent(longitude) + "&zoom=18&addressdetails=1&accept-language=en";
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("Could not look up your address. Please fill it manually.");
        const data = await res.json();
        const addr = data.address || {};
        const line1 = [addr.house_number, addr.road || addr.pedestrian || addr.footway || addr.neighbourhood].filter(Boolean).join(", ");
        const line2 = [addr.suburb, addr.city_district, addr.county].filter(Boolean).join(", ");
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
        const pincode = String(addr.postcode || "").replace(/\s+/g, "").slice(0, 6);
        setField("line1", line1 || String(data.display_name || "").split(",").slice(0, 2).join(",").trim());
        setField("line2", line2);
        setField("city", city);
        setField("state", addr.state || "");
        setField("pincode", pincode);
        if (status) status.textContent = "Address filled. Please check and edit if needed.";
        showToast("Address filled from your location", "success");
      } catch (err) {
        if (status) status.textContent = "Could not fill the address automatically. Please enter it manually.";
        showToast(err.message || "Could not detect your address", "error");
      } finally {
        restore();
      }
    }, (err) => {
      restore();
      const message = err.code === 1 ? "Location permission denied. Allow location access and try again."
        : err.code === 2 ? "Your location is unavailable right now."
        : "Location request timed out. Please try again.";
      if (status) status.textContent = "Location not detected. You can enter the address manually.";
      showToast(message, "error");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    return;
  }

  if (action === "wishlist") {
    if (!requireAuth(currentPath())) return;
    try {
      const res = await api("/api/wishlist", { method: "POST", body: { productId: id } });
      if (res.added) state.wishlist.add(id); else state.wishlist.delete(id);
      el.classList.toggle("active", res.added);
      showToast(res.added ? "Added to wishlist" : "Removed from wishlist", "success");
      if (state.route && state.route.name === "wishlist") render();
    } catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "add-cart" || action === "add-cart-detail" || action === "buy-now") {
    if (!requireAuth(currentPath())) return;
    let productId = id;
    let variant = el.dataset.variant || "";
    let qty = 1;
    if (action === "add-cart-detail" || action === "buy-now") {
      productId = state.pd.productId;
      variant = state.pd.variant;
      qty = state.pd.qty;
    }
    try {
      await api("/api/cart", { method: "POST", body: { productId, variant, qty } });
      await refreshCart();
      showToast("Added to cart", "success");
      if (action === "buy-now") go("/checkout");
    } catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "load-more") {
    const listing = state.listing;
    if (!listing || listing.loading || listing.loaded >= listing.total) return;
    listing.loading = true;
    el.disabled = true;
    try {
      const params = new URLSearchParams(listing.base);
      params.set("page", String(listing.page + 1));
      const data = await api("/api/products?" + params.toString(), { auth: false });
      const grid = $("#product-grid");
      if (grid) grid.insertAdjacentHTML("beforeend", (data.products || []).map(productCard).join(""));
      listing.page += 1;
      listing.loaded += (data.products || []).length;
      listing.total = Number(data.total) || listing.total;
      const wrap = $("#load-more-wrap");
      if (!data.products || !data.products.length || listing.loaded >= listing.total) {
        if (wrap) wrap.remove();
      } else {
        el.disabled = false;
      }
    } catch (e) {
      el.disabled = false;
      showToast(e.message, "error");
    } finally {
      listing.loading = false;
    }
    return;
  }

  if (action === "thumb") {
    const i = Number(el.dataset.index);
    state.pd.imageIndex = i;
    const main = $("#pd-main-img");
    const product = el.closest(".pd-gallery");
    const thumbs = $$(".pd-thumbs button", product);
    if (main && thumbs[i]) {
      main.src = $("img", thumbs[i]).src;
      thumbs.forEach((b, idx) => b.classList.toggle("active", idx === i));
    }
    return;
  }

  if (action === "variant") {
    const type = el.dataset.type;
    const value = el.dataset.value;
    state.pd.variant = value;
    $$('.variant-option[data-type="' + CSS.escape(type) + '"]').forEach((b) => b.classList.toggle("active", b.dataset.value === value));
    const priceEl = $("#pd-price-now");
    if (priceEl && el.dataset.price) priceEl.textContent = money(Number(el.dataset.price));
    return;
  }

  if (action === "qty-detail-inc" || action === "qty-detail-dec") {
    state.pd.qty = Math.max(1, Math.min(20, state.pd.qty + (action === "qty-detail-inc" ? 1 : -1)));
    const elQty = $("#pd-qty");
    if (elQty) elQty.textContent = state.pd.qty;
    return;
  }

  if (action === "set-rating") {
    state.reviewRating = Number(el.dataset.rating);
    $$("#rating-input button").forEach((b) => b.classList.toggle("active", Number(b.dataset.rating) <= state.reviewRating));
    return;
  }

  if (action === "cart-inc" || action === "cart-dec") {
    const row = el.closest(".cart-item");
    const span = row ? row.querySelector(".qty span") : null;
    const current = span ? Number(span.textContent) : 1;
    const qty = Math.max(1, current + (action === "cart-inc" ? 1 : -1));
    try {
      await api("/api/cart/" + id, { method: "PUT", body: { qty } });
      state.appliedCoupon = null;
      render();
    } catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "remove-cart") {
    try { await api("/api/cart/" + id, { method: "DELETE" }); state.appliedCoupon = null; await refreshCart(); render(); }
    catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "save-later" || action === "move-cart") {
    try {
      await api("/api/cart/" + id, { method: "PUT", body: { saved: action === "save-later" } });
      state.appliedCoupon = null;
      await refreshCart();
      render();
    } catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "remove-coupon") {
    state.appliedCoupon = null;
    render();
    return;
  }

  if (action === "go-checkout") {
    go("/checkout");
    return;
  }

  if (action === "select-address") {
    state.checkout.addressId = id;
    $$(".addr-option").forEach((l) => l.classList.toggle("selected", l.querySelector("input").value === id));
    return;
  }

  if (action === "select-payment") {
    const method = el.dataset.method;
    state.checkout.payment = method;
    $$(".pay-option").forEach((l) => l.classList.toggle("selected", l.querySelector("input").value === method));
    return;
  }

  if (action === "place-order") {
    if (!state.checkout.addressId) { showToast("Please add or select a delivery address", "error"); return; }
    el.disabled = true;
    el.textContent = "Placing order...";
    try {
      const addrRes = await api("/api/addresses");
      const address = (addrRes.addresses || []).find((a) => a.id === state.checkout.addressId);
      if (!address) throw new ApiError("Please select a valid address", 400);
      const order = await api("/api/orders", {
        method: "POST",
        body: { address, paymentMethod: state.checkout.payment, couponCode: state.appliedCoupon ? state.appliedCoupon.code : "" },
      });
      state.appliedCoupon = null;
      state.checkout = { addressId: null, payment: "COD" };
      await refreshCart();
      go("/success/" + order.id);
    } catch (e) {
      el.disabled = false;
      el.textContent = t("placeOrder");
      showToast(e.message, "error");
    }
    return;
  }

  if (action === "cancel-order") {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      await api("/api/orders/" + id + "/cancel", { method: "POST" });
      showToast("Order cancelled", "success");
      render();
    } catch (e) { showToast(e.message, "error"); }
    return;
  }

  if (action === "open-address") { openAddressModal(); return; }
  if (action === "open-addresses") { await openAddressManager(); return; }
  if (action === "open-profile") { openProfileModal(); return; }
  if (action === "open-payments") { openPaymentsModal(); return; }
  if (action === "open-notifications") { await openNotificationsModal(); return; }
  if (action === "edit-address") {
    try {
      const data = await api("/api/addresses");
      const address = (data.addresses || []).find((a) => a.id === id);
      if (address) openAddressModal(address);
    } catch (e) { showToast(e.message, "error"); }
    return;
  }
  if (action === "delete-address") {
    if (!confirm("Delete this address?")) return;
    try {
      await api("/api/addresses/" + id, { method: "DELETE" });
      closeModal();
      render();
    } catch (e) { showToast(e.message, "error"); }
    return;
  }
  if (action === "close-modal") { closeModal(); return; }
  if (action === "logout") { openLogoutConfirm(); return; }
  if (action === "confirm-logout") {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {}
    closeModal();
    clearAuth();
    showToast("Logged out", "success");
    go("/");
    return;
  }
  if (action === "clear-filters") { go("/products"); return; }
  if (action === "login-tab") {
    state.otpMode = el.dataset.mode;
    state.otpSent = false;
    render();
    return;
  }
  if (action === "switch-otp") { state.otpMode = "otp"; state.otpSent = false; render(); return; }
  if (action === "resend-register-otp") {
    if (!state.otpEmail) return;
    try {
      await api("/api/auth/send-otp", { method: "POST", auth: false, body: { email: state.otpEmail } });
      showToast("Verification OTP resent", "success");
    } catch (err) {
      showToast(err.message || "Could not resend OTP", "error");
    }
    return;
  }
  if (action === "reset-register") {
    state.registerSent = false;
    state.otpEmail = "";
    render();
    return;
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (el.tagName === "A" && action === "banner-dot") e.preventDefault();
  handleAction(action, el).catch((err) => showToast(err.message || "Something went wrong", "error"));
});

document.addEventListener("change", (e) => {
  const filterInput = e.target.closest("[data-filter-kind]");
  if (filterInput) { syncFilterDraftFromInput(filterInput); return; }
  const quickSort = e.target.closest("[data-quick-sort]");
  if (quickSort && state.filterDraft) {
    state.filterDraft.sort = quickSort.value;
    const params = draftToParams(state.filterDraft);
    go("/products" + (params.toString() ? "?" + params.toString() : ""));
  }
});

document.addEventListener("input", (e) => {
  const priceInput = e.target.closest("[data-filter-price]");
  if (priceInput) { syncFilterPrice(priceInput); return; }
  const brandSearch = e.target.closest('[data-role="filter-brand-search"]');
  if (brandSearch) {
    const term = brandSearch.value.trim().toLowerCase();
    $$(".brand-opt").forEach((label) => {
      label.hidden = term && String(label.dataset.brandName || "").indexOf(term) < 0;
    });
  }
  const colorSearch = e.target.closest('[data-role="filter-color-search"]');
  if (colorSearch) {
    const term = colorSearch.value.trim().toLowerCase();
    const panel = colorSearch.closest(".filter-panel");
    let visible = 0;
    $$(".color-opt", panel).forEach((label) => {
      const match = !term || String(label.dataset.colorName || "").indexOf(term) >= 0;
      label.hidden = !match;
      if (match) visible++;
    });
    const empty = panel && panel.querySelector('[data-role="filter-color-empty"]');
    if (empty) empty.hidden = visible > 0;
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  const fd = new FormData(form);
  const next = form.dataset.next || "/";
  const btn = form.querySelector('button[type="submit"]');
  const setBusy = (busy, label) => {
    if (!btn) return;
    btn.disabled = busy;
    if (label) btn.textContent = label;
  };

  try {
    if (kind === "filters") {
      const params = new URLSearchParams();
      fd.forEach((v, k) => { if (String(v).trim()) params.set(k, String(v).trim()); });
      go("/products" + (params.toString() ? "?" + params.toString() : ""));
      return;
    }

    if (kind === "login") {
      setBusy(true, "Logging in...");
      let data;
      try {
        data = await api("/api/auth/login", { method: "POST", body: { email: fd.get("email"), password: fd.get("password") }, auth: false });
      } catch (err) {
        if (err.status === 403) {
          state.otpMode = "otp";
          state.otpSent = false;
          state.otpEmail = String(fd.get("email") || "");
          showToast(err.message, "error");
          render();
          return;
        }
        throw err;
      }
      saveToken(data.token, data.user);
      await afterLogin();
      showToast("Welcome back, " + data.user.name.split(" ")[0] + "!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "register") {
      setBusy(true, "Creating account...");
      const data = await api("/api/auth/register", {
        method: "POST", auth: false,
        body: { name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"), password: fd.get("password") },
      });
      if (data.pending) {
        state.otpEmail = String(data.email || fd.get("email") || "");
        state.registerSent = true;
        showToast("Verification OTP sent to your email", "success");
        render();
        return;
      }
      saveToken(data.token, data.user);
      await afterLogin();
      showToast("Account created successfully!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "register-verify") {
      setBusy(true, "Verifying...");
      const data = await api("/api/auth/verify-otp", { method: "POST", auth: false, body: { email: fd.get("email"), otp: fd.get("otp") } });
      saveToken(data.token, data.user);
      state.registerSent = false;
      state.otpEmail = "";
      await afterLogin();
      showToast("Email verified. Welcome to Aamart!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "otp-send") {
      setBusy(true, "Sending OTP...");
      await api("/api/auth/send-otp", { method: "POST", auth: false, body: { email: fd.get("email") } });
      state.otpEmail = String(fd.get("email"));
      state.otpSent = true;
      showToast("If the account exists, an OTP has been sent", "success");
      render();
      return;
    }

    if (kind === "otp-verify") {
      setBusy(true, "Verifying...");
      const data = await api("/api/auth/verify-otp", { method: "POST", auth: false, body: { email: fd.get("email"), otp: fd.get("otp") } });
      saveToken(data.token, data.user);
      state.otpSent = false;
      await afterLogin();
      showToast("Logged in successfully!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "forgot-send") {
      setBusy(true, "Sending OTP...");
      await api("/api/auth/forgot-password", { method: "POST", auth: false, body: { email: fd.get("email") } });
      state.otpEmail = String(fd.get("email"));
      state.resetSent = true;
      showToast("If the account exists, an OTP has been sent", "success");
      render();
      return;
    }

    if (kind === "reset-password") {
      setBusy(true, "Resetting...");
      await api("/api/auth/reset-password", { method: "POST", auth: false, body: { email: fd.get("email"), otp: fd.get("otp"), password: fd.get("password") } });
      state.resetSent = false;
      showToast("Password reset successfully. Please login.", "success");
      go("/login");
      return;
    }

    if (kind === "profile") {
      setBusy(true, "Saving...");
      const data = await api("/api/auth/update", {
        method: "PUT",
        body: { name: fd.get("name"), phone: fd.get("phone"), password: fd.get("password") || undefined, currentPassword: fd.get("currentPassword") || undefined },
      });
      if (data.token) saveToken(data.token, data.user);
      else state.user = data.user;
      closeModal();
      showToast("Profile updated", "success");
      render();
      return;
    }

    if (kind === "address") {
      setBusy(true, "Saving...");
      const addressId = form.dataset.id;
      const body = {
        name: fd.get("name"), phone: fd.get("phone"), line1: fd.get("line1"), line2: fd.get("line2"),
        city: fd.get("city"), state: fd.get("state"), pincode: fd.get("pincode"), type: fd.get("type"),
        isDefault: fd.get("isDefault") === "on",
      };
      const saved = addressId
        ? await api("/api/addresses/" + addressId, { method: "PUT", body })
        : await api("/api/addresses", { method: "POST", body });
      if (saved && saved.id && currentPath().startsWith("/checkout")) state.checkout.addressId = saved.id;
      closeModal();
      showToast("Address saved", "success");
      render();
      return;
    }

    if (kind === "review") {
      setBusy(true, "Submitting...");
      const data = await api("/api/reviews", {
        method: "POST",
        body: { productId: form.dataset.productId, rating: state.reviewRating, title: fd.get("title"), body: fd.get("body") },
      });
      showToast(data.pending ? "Review submitted for approval" : "Review submitted", "success");
      render();
      return;
    }

    if (kind === "coupon") {
      const code = String(fd.get("code") || "").trim();
      if (!code) return;
      setBusy(true, "Applying...");
      const cart = await api("/api/cart");
      const res = await api("/api/coupons/validate", { method: "POST", body: { code, itemTotal: cart.itemTotal } });
      state.appliedCoupon = { code: res.coupon.code, type: res.coupon.type, value: res.coupon.value, maxDiscount: res.coupon.maxDiscount };
      showToast("Coupon applied successfully", "success");
      render();
      return;
    }
  } catch (err) {
    showToast(err.message || "Something went wrong", "error");
    if (err.status === 401) {
      clearAuth();
      go("/login?next=" + encodeURIComponent(currentPath()));
    }
    setBusy(false);
  }
});

async function afterLogin() {
  await Promise.all([refreshMe(), refreshWishlist(), refreshCart()]);
}

/* ---------------------------------------------------------------------------
   Search suggestions
   --------------------------------------------------------------------------- */
const RECENT_SEARCHES_KEY = "aamart_recent_searches";
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4" stroke-linecap="round"></path></svg>';
const CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const TAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 13l-7 7-9-9V4h7l9 9z" stroke-linejoin="round"></path><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>';

function readRecentSearches() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.map((v) => String(v || "").trim()).filter((v) => {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecentSearch(value) {
  const term = String(value || "").trim();
  if (!term) return;
  const recent = readRecentSearches().filter((v) => v.toLowerCase() !== term.toLowerCase());
  recent.unshift(term);
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5))); } catch {}
}

function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch {}
}

function setupSearch() {
  const form = $("#search-form");
  const input = $("#search-input");
  const box = $("#suggestions");
  const field = $("#search-field");
  const clearBtn = $("#search-clear");
  if (!form || !input || !box) return;
  let timer = null;
  let seq = 0;

  const updateClear = () => {
    const hasValue = input.value.length > 0;
    if (field) field.classList.toggle("has-value", hasValue);
    if (clearBtn) clearBtn.classList.toggle("hidden", !hasValue);
  };

  const hideSuggestions = () => {
    box.classList.add("hidden");
    box.innerHTML = "";
  };

  const showSuggestions = (html) => {
    box.innerHTML = html;
    box.classList.remove("hidden");
  };

  const showRecent = () => {
    const recent = readRecentSearches();
    if (!recent.length) { hideSuggestions(); return; }
    showSuggestions(
      '<div class="suggestions-head"><span>' + escapeHtml(t("recentSearches")) + "</span>" +
      '<button type="button" class="suggestions-clear" data-clear-recent>' + escapeHtml(t("clear")) + "</button></div>" +
      recent.map((term) =>
        '<button type="button" class="suggestion" data-recent="' + escapeHtml(term) + '">' +
          '<span class="s-icon" aria-hidden="true">' + CLOCK_ICON + "</span>" +
          '<span class="s-title">' + escapeHtml(term) + "</span>" +
        "</button>"
      ).join("")
    );
  };

  const runSearch = (value) => {
    const term = String(value || "").trim();
    if (!term) return;
    clearTimeout(timer);
    seq += 1;
    saveRecentSearch(term);
    hideSuggestions();
    input.value = term;
    updateClear();
    go("/products?q=" + encodeURIComponent(term));
    input.blur();
  };

  const getCategoryMatches = async (term) => {
    if (!state.categories.length) {
      try {
        const data = await api("/api/categories", { auth: false });
        state.categories = data.categories || [];
      } catch {
        return [];
      }
    }
    const needle = term.toLowerCase();
    const out = [];
    for (const cat of state.categories) {
      const catName = String(cat.name || "");
      const catSlug = String(cat.slug || "");
      if (catName && (catName.toLowerCase().includes(needle) || catSlug.toLowerCase().includes(needle))) {
        out.push({ name: catName, href: "#/products?category=" + encodeURIComponent(catSlug) });
      }
      for (const sub of (cat.subs || [])) {
        const subName = String(sub.name || "");
        const subSlug = String(sub.slug || "");
        if (subName && (subName.toLowerCase().includes(needle) || subSlug.toLowerCase().includes(needle))) {
          out.push({ name: subName, href: "#/products?category=" + encodeURIComponent(catSlug) + "&sub=" + encodeURIComponent(subSlug) });
        }
      }
      if (out.length >= 3) break;
    }
    return out.slice(0, 3);
  };

  const renderMatches = (term, categories, products) => {
    const parts = [];
    if (categories.length) {
      parts.push(categories.map((cat) =>
        '<a class="suggestion" href="' + cat.href + '" data-query="' + escapeHtml(term) + '">' +
          '<span class="s-icon" aria-hidden="true">' + TAG_ICON + "</span>" +
          '<span class="s-title">' + escapeHtml(cat.name) + "</span>" +
        "</a>"
      ).join(""));
    }
    if (products.length) {
      parts.push(products.map((p) =>
        '<a class="suggestion" href="#/product/' + encodeURIComponent(p.id) + '" data-query="' + escapeHtml(term) + '">' +
          '<img src="' + safeImage(p.image) + '" alt="">' +
          '<div><div class="s-title">' + escapeHtml(p.title) + '</div><div class="s-price">' + money(p.price) + " \u00B7 " + escapeHtml(p.category) + "</div></div>" +
        "</a>"
      ).join(""));
    }
    if (!categories.length && !products.length) {
      parts.push('<div class="suggestion-empty">' + escapeHtml(t("noMatches")) + ' "' + escapeHtml(term) + '"</div>');
    } else {
      parts.push(
        '<a class="suggestion" href="#/products?q=' + encodeURIComponent(term) + '" data-query="' + escapeHtml(term) + '">' +
          '<span class="s-icon" aria-hidden="true">' + SEARCH_ICON + "</span>" +
          '<span class="s-title s-link">' + escapeHtml(t("seeAllResults")) + ' "' + escapeHtml(term) + '" \u203A</span>' +
        "</a>"
      );
    }
    showSuggestions(parts.join(""));
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const term = input.value.trim();
    if (!term) { showRecent(); input.focus(); return; }
    runSearch(term);
  });

  input.addEventListener("input", () => {
    updateClear();
    const term = input.value.trim();
    clearTimeout(timer);
    seq += 1;
    if (!term) { showRecent(); return; }
    if (term.length < 2) { hideSuggestions(); return; }
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        const [data, categories] = await Promise.all([
          api("/api/products?q=" + encodeURIComponent(term) + "&limit=6", { auth: false }),
          getCategoryMatches(term),
        ]);
        if (mySeq !== seq || input.value.trim() !== term) return;
        const productLimit = Math.max(0, 6 - categories.length);
        renderMatches(term, categories, (data.products || []).slice(0, productLimit));
      } catch {
        if (mySeq === seq) hideSuggestions();
      }
    }, 300);
  });

  input.addEventListener("focus", () => {
    updateClear();
    if (!input.value.trim()) showRecent();
    else if (box.innerHTML) box.classList.remove("hidden");
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideSuggestions();
      input.blur();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      updateClear();
      hideSuggestions();
      input.focus();
      showRecent();
    });
  }

  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear-recent]")) {
      e.preventDefault();
      clearRecentSearches();
      hideSuggestions();
      return;
    }
    const recent = e.target.closest("[data-recent]");
    if (recent) {
      e.preventDefault();
      input.value = recent.dataset.recent || "";
      updateClear();
      runSearch(input.value);
      return;
    }
    const queryLink = e.target.closest("[data-query]");
    if (queryLink) saveRecentSearch(queryLink.dataset.query);
    if (e.target.closest(".suggestion")) hideSuggestions();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) hideSuggestions();
  });

  window.addEventListener("hashchange", hideSuggestions);
  updateClear();
}

/* ---------------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------------- */
async function boot() {
  setupSearch();
  const year = $("#footer-year");
  if (year) year.textContent = new Date().getFullYear();
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/";
  const settingsPromise = api("/api/settings", { auth: false }).then((settings) => {
    state.settings = settings;
  }).catch(() => {
    state.settings = null;
  });
  if (state.token) {
    await Promise.all([settingsPromise, afterLogin()]);
    await render();
  } else if (currentPath() === "/") {
    await Promise.all([settingsPromise, render()]);
  } else {
    await settingsPromise;
    await render();
  }
}

boot();

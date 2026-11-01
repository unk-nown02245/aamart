"use strict";

/* ---------------------------------------------------------------------------
   Aamart storefront (vanilla JS, hash router, mobile first)
   --------------------------------------------------------------------------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const state = {
  token: localStorage.getItem("aamart_token") || "",
  user: null,
  lang: localStorage.getItem("aamart_lang") || "en",
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
  reviewRating: 5,
  route: null,
  timers: [],
};

let renderToken = 0;

const I18N = {
  en: {
    home: "Home", categories: "Categories", cart: "Cart", orders: "Orders", account: "Account",
    search: "Search for products, brands and more", addToCart: "Add to Cart", buyNow: "Buy Now",
    viewAll: "View all", deals: "Deals of the Day", trending: "Trending Products",
    newArrivals: "New Arrivals", bestDiscounts: "Best Discounts", recentlyViewed: "Recently Viewed",
    proceed: "Proceed to Checkout", placeOrder: "Place Order", continue: "Continue",
    login: "Login", register: "Create Account", logout: "Logout", wishlist: "Wishlist",
    emptyCart: "Your cart is empty", emptyOrders: "No orders yet", emptyWishlist: "Your wishlist is empty",
    free: "FREE", total: "Total", itemTotal: "Item total", discount: "Discount",
    delivery: "Delivery", tax: "Tax", coupon: "Coupon", apply: "Apply", remove: "Remove",
    inStock: "In stock", outOfStock: "Out of stock", lowStock: "Only a few left",
  },
  hi: {
    home: "होम", categories: "श्रेणियाँ", cart: "कार्ट", orders: "ऑर्डर", account: "खाता",
    search: "उत्पाद, ब्रांड और बहुत कुछ खोजें", addToCart: "कार्ट में डालें", buyNow: "अभी खरीदें",
    viewAll: "सभी देखें", deals: "आज के ऑफर", trending: "ट्रेंडिंग उत्पाद",
    newArrivals: "नए उत्पाद", bestDiscounts: "सबसे अच्छी छूट", recentlyViewed: "हाल में देखे गए",
    proceed: "चेकआउट करें", placeOrder: "ऑर्डर करें", continue: "जारी रखें",
    login: "लॉगिन", register: "खाता बनाएं", logout: "लॉगआउट", wishlist: "विशलिस्ट",
    emptyCart: "आपका कार्ट खाली है", emptyOrders: "अभी कोई ऑर्डर नहीं", emptyWishlist: "आपकी विशलिस्ट खाली है",
    free: "मुफ़्त", total: "कुल", itemTotal: "आइटम कुल", discount: "छूट",
    delivery: "डिलीवरी", tax: "कर", coupon: "कूपन", apply: "लागू करें", remove: "हटाएं",
    inStock: "स्टॉक में", outOfStock: "स्टॉक ख़त्म", lowStock: "कुछ ही बचे हैं",
  },
};
function t(key) {
  return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
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
  root.innerHTML = '<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">' + html + "</div></div>";
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
  const badge = $("#cart-badge");
  if (badge) {
    badge.textContent = state.cartCount;
    badge.hidden = !state.cartCount;
  }
  const langBtn = $("#lang-toggle");
  if (langBtn) langBtn.textContent = state.lang === "hi" ? "\u0939\u093F" : "EN";
  const search = $("#search-input");
  if (search) search.placeholder = t("search");
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
  if (head === "wishlist") return { name: "wishlist", query, path: pathPart };
  if (head === "login") return { name: "login", query, path: pathPart };
  if (head === "register") return { name: "register", query, path: pathPart };
  if (head === "forgot") return { name: "forgot", query, path: pathPart };
  return { name: "home", query, path: pathPart };
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
      case "orders": return await renderOrders(token);
      case "order": return await renderOrder(token, route.id);
      case "success": return await renderSuccess(token, route.id);
      case "account": return await renderAccount(token);
      case "wishlist": return await renderWishlist(token);
      case "login": return renderLogin(token, route);
      case "register": return renderRegister(token, route);
      case "forgot": return renderForgot(token, route);
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
        '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' +
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

  let html = "";
  if (banners.length) {
    html += '<div class="banner-slider"><div class="banner-track">' +
      banners.map((b) => '<a class="banner-slide" href="' + escapeHtml(b.link || "#/") + '"><img src="' + escapeHtml(b.image) + '" alt="' + escapeHtml(b.title) + '"></a>').join("") +
      '</div><div class="banner-dots">' + banners.map((_, i) => '<button class="' + (i === 0 ? "active" : "") + '" data-action="banner-dot" data-index="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>').join("") + "</div></div>";
  }

  html += '<div class="offer-strip">' +
    '<div class="offer-tile"><div class="oi">\u{1F69A}</div><div class="ot">Free Delivery</div><div class="os">Above \u20B9499</div></div>' +
    '<div class="offer-tile"><div class="oi">\u{1F3F7}\uFE0F</div><div class="ot">Coupons</div><div class="os">Save more</div></div>' +
    '<div class="offer-tile"><div class="oi">\u21A9\uFE0F</div><div class="ot">Easy Returns</div><div class="os">7-day returns</div></div>' +
    "</div>";

  html += '<div class="section"><div class="section-head"><h2>' + t("categories") + '</h2><a href="#/categories">' + t("viewAll") + ' \u203A</a></div><div class="cat-strip">' +
    cats.map((c) => '<a class="cat-chip" href="#/products?category=' + encodeURIComponent(c.slug) + '"><span class="emoji">' + (c.icon || "\u{1F3F7}") + '</span><span class="cname">' + escapeHtml(c.name) + '</span><span class="ccount">' + c.count + " items</span></a>").join("") +
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
  const html = '<div class="page-head"><h1>' + t("categories") + "</h1></div>" +
    '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' +
    state.categories.map((c) =>
      '<div class="card">' +
        '<div class="row" style="gap:8px"><span style="font-size:26px">' + (c.icon || "\u{1F3F7}") + "</span><div><strong>" + escapeHtml(c.name) + '</strong><div class="muted small">' + c.count + " items</div></div></div>" +
        '<div class="row wrap" style="gap:6px;margin-top:10px">' +
          '<a class="chip" href="#/products?category=' + encodeURIComponent(c.slug) + '">All</a>' +
          (c.subs || []).slice(0, 6).map((s) => '<a class="chip" href="#/products?sub=' + encodeURIComponent(s.slug) + '">' + escapeHtml(s.name) + "</a>").join("") +
        "</div>" +
      "</div>"
    ).join("") + "</div>";
  $("#app").innerHTML = html;
}

/* ---------------------------------------------------------------------------
   Product listing
   --------------------------------------------------------------------------- */
async function renderProducts(token, route) {
  const q = route.query;
  const [catsRes, brandsRes] = await Promise.all([
    api("/api/categories", { auth: false }).catch(() => ({ categories: [] })),
    api("/api/brands", { auth: false }).catch(() => ({ brands: [] })),
  ]);
  const params = new URLSearchParams();
  ["q", "category", "sub", "brand", "minPrice", "maxPrice", "rating", "discount", "availability", "sort"].forEach((k) => {
    if (q[k]) params.set(k, q[k]);
  });
  params.set("limit", "60");
  const data = await api("/api/products?" + params.toString(), { auth: false });
  if (token !== renderToken) return;
  state.categories = catsRes.categories || [];
  const brands = brandsRes.brands || [];

  const catOptions = '<option value="">All categories</option>' +
    state.categories.map((c) => {
      const subs = (c.subs || []).map((s) => '<option value="' + escapeHtml(s.slug) + '"' + (q.sub === s.slug ? " selected" : "") + ">&nbsp;&nbsp;\u21B3 " + escapeHtml(s.name) + "</option>").join("");
      return '<option value="' + escapeHtml(c.slug) + '"' + (q.category === c.slug ? " selected" : "") + ">" + escapeHtml(c.name) + "</option>" + subs;
    }).join("");
  const brandOptions = '<option value="">All brands</option>' + brands.map((b) => '<option value="' + escapeHtml(b.name) + '"' + (q.brand === b.name ? " selected" : "") + ">" + escapeHtml(b.name) + "</option>").join("");
  const sortValue = q.sort || "popularity";
  const sortOptions = [
    ["popularity", "Popularity"], ["price-asc", "Price: Low to High"], ["price-desc", "Price: High to Low"],
    ["newest", "Newest First"], ["discount", "Discount"], ["rating", "Rating"],
  ].map(([v, l]) => '<option value="' + v + '"' + (sortValue === v ? " selected" : "") + ">" + l + "</option>").join("");

  const active = [];
  if (q.q) active.push('<a class="chip" href="#/products">\u2715 "' + escapeHtml(q.q) + '"</a>');
  if (q.category) active.push('<span class="chip">' + escapeHtml(q.category) + "</span>");
  if (q.sub) active.push('<span class="chip">' + escapeHtml(q.sub) + "</span>");
  if (q.brand) active.push('<span class="chip">' + escapeHtml(q.brand) + "</span>");
  if (q.rating) active.push('<span class="chip">' + q.rating + "\u2605 & up</span>");
  if (q.discount) active.push('<span class="chip">' + q.discount + "%+ off</span>");
  if (q.availability === "in") active.push('<span class="chip">In stock</span>');

  const title = q.q ? 'Search results for "' + escapeHtml(q.q) + '"' : (q.category ? escapeHtml(q.category) : "All Products");

  const html =
    '<div class="crumbs"><a href="#/">Home</a> \u203A ' + escapeHtml(title) + "</div>" +
    '<div class="page-head"><h1>' + title + '</h1><span class="muted small">' + data.total + " products</span></div>" +
    '<div class="active-filters">' + active.join("") + "</div>" +
    '<div class="listing">' +
      '<form class="filters" data-form="filters" id="filters-form">' +
        '<input type="hidden" name="q" value="' + escapeHtml(q.q || "") + '">' +
        '<div class="row between"><strong>Filters</strong><button type="button" class="link small" data-action="clear-filters">Clear all</button></div>' +
        '<div class="filter-group"><h4>Sort by</h4><select class="input" name="sort">' + sortOptions + "</select></div>" +
        '<div class="filter-group"><h4>Category</h4><select class="input" name="category">' + catOptions + "</select></div>" +
        '<div class="filter-group"><h4>Brand</h4><select class="input" name="brand">' + brandOptions + "</select></div>" +
        '<div class="filter-group"><h4>Price (\u20B9)</h4><div class="field-row"><input class="input" name="minPrice" type="number" min="0" placeholder="Min" value="' + escapeHtml(q.minPrice || "") + '"><input class="input" name="maxPrice" type="number" min="0" placeholder="Max" value="' + escapeHtml(q.maxPrice || "") + '"></div></div>' +
        '<div class="filter-group"><h4>Customer rating</h4><select class="input" name="rating"><option value="">Any rating</option>' + [4, 3, 2].map((r) => '<option value="' + r + '"' + (q.rating === String(r) ? " selected" : "") + ">" + r + "\u2605 & above</option>").join("") + "</select></div>" +
        '<div class="filter-group"><h4>Discount</h4><select class="input" name="discount"><option value="">Any discount</option>' + [10, 20, 30, 50].map((d) => '<option value="' + d + '"' + (q.discount === String(d) ? " selected" : "") + ">" + d + "% or more</option>").join("") + "</select></div>" +
        '<div class="filter-group"><h4>Availability</h4><select class="input" name="availability"><option value="">All</option><option value="in"' + (q.availability === "in" ? " selected" : "") + ">In stock</option><option value=\"out\"" + (q.availability === "out" ? " selected" : "") + ">Out of stock</option></select></div>" +
        '<button class="btn block" type="submit">Apply Filters</button>' +
      "</form>" +
      '<div>' +
        (data.products.length
          ? '<div class="product-grid">' + data.products.map(productCard).join("") + "</div>"
          : emptyView("\u{1F50E}", "No products found", "Try changing your filters or search keywords.", "#/products", "Clear filters")) +
      "</div>" +
    "</div>";

  $("#app").innerHTML = html;
  const form = $("#filters-form");
  if (form) {
    form.querySelectorAll("select").forEach((sel) => sel.addEventListener("change", () => form.requestSubmit()));
  }
}

/* ---------------------------------------------------------------------------
   Product detail
   --------------------------------------------------------------------------- */
async function renderProduct(token, id) {
  const p = await api("/api/products/" + encodeURIComponent(id), { auth: false });
  if (token !== renderToken) return;

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
    variantGroups[type].map((v) => '<button class="variant-option' + (v.value === state.pd.variant ? " active" : "") + '" data-action="variant" data-type="' + escapeHtml(type) + '" data-value="' + escapeHtml(v.value) + '">' + escapeHtml(v.value) + (v.price && v.price !== p.price ? " \u00B7 " + money(v.price) : "") + "</button>").join("") +
    "</div></div>"
  ).join("");

  const thumbs = (p.images || []).map((src, i) =>
    '<button data-action="thumb" data-index="' + i + '" class="' + (i === 0 ? "active" : "") + '"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(p.title) + " image " + (i + 1) + '"></button>'
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
        '<img id="pd-main-img" class="pd-main-img" src="' + escapeHtml(p.images[0]) + '" alt="' + escapeHtml(p.title) + '">' +
        '<div class="pd-thumbs">' + thumbs + "</div>" +
      "</div>" +
      '<div class="pd-info">' +
        '<div class="pd-brand">' + escapeHtml(p.brand || "Aamart") + "</div>" +
        '<h1 class="pd-title">' + escapeHtml(p.title) + "</h1>" +
        '<div class="pd-rating"><span class="rating-pill">' + Number(p.rating || 0).toFixed(1) + ' \u2605</span><span class="muted small">' + (p.ratingCount || 0) + " ratings</span>" +
          (p.stock > 0 ? '<span class="pc-stock in small">\u2713 ' + t("inStock") + "</span>" : '<span class="pc-stock out small">' + t("outOfStock") + "</span>") + "</div>" +
        '<div class="pd-price"><span class="now">' + money(p.price) + '</span>' +
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

async function renderOrders(token) {
  if (!requireAuth("/orders")) return;
  const data = await api("/api/orders");
  if (token !== renderToken) return;
  const orders = data.orders || [];
  $("#app").innerHTML = '<div class="page-head"><h1>' + t("orders") + "</h1></div>" +
    (orders.length ? orders.map(orderCard).join("") : emptyView("\u{1F4E6}", t("emptyOrders"), "Your placed orders will appear here.", "#/", "Start Shopping"));
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
      o.items.map((it) => '<div class="cart-item"><img src="' + escapeHtml(it.image || "/img/placeholder.svg") + '" alt="' + escapeHtml(it.name) + '">' +
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
      '<div class="card" style="text-align:left;margin:14px 0;background:#f8faff">' +
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
async function renderAccount(token) {
  if (!requireAuth("/account")) return;
  await refreshMe();
  const addrRes = await api("/api/addresses");
  if (token !== renderToken) return;
  const u = state.user || { name: "", email: "", phone: "" };
  const addresses = addrRes.addresses || [];
  const initial = (u.name || "A").trim().charAt(0).toUpperCase();

  const addressHtml = addresses.length
    ? addresses.map((a) =>
        '<div class="address-card"><div class="a-head"><span class="a-name">' + escapeHtml(a.name) + ' <span class="a-tag">' + escapeHtml(a.type || "Home") + (a.is_default ? " \u00B7 Default" : "") + "</span></span></div>" +
          '<div class="small">' + escapeHtml(a.line1) + (a.line2 ? ", " + escapeHtml(a.line2) : "") + ", " + escapeHtml(a.city) + ", " + escapeHtml(a.state) + " - " + escapeHtml(a.pincode) + "<br>Phone: " + escapeHtml(a.phone) + "</div>" +
          '<div class="a-actions"><button class="link" data-action="edit-address" data-id="' + a.id + '">Edit</button><button class="link" data-action="delete-address" data-id="' + a.id + '" style="color:var(--red)">Delete</button></div>' +
        "</div>"
      ).join("")
    : '<p class="muted small">No saved addresses yet.</p>';

  $("#app").innerHTML =
    '<div class="page-head"><h1>' + t("account") + "</h1></div>" +
    '<div class="account-grid">' +
      '<div class="card"><div class="profile-head"><div class="avatar">' + escapeHtml(initial) + '</div><div><strong>' + escapeHtml(u.name || "Customer") + '</strong><div class="muted small">' + escapeHtml(u.email || "") + "</div></div></div>" +
        '<div class="menu-list" style="margin-top:12px">' +
          '<a class="menu-item" href="#/orders"><span class="mi-icon">\u{1F4E6}</span>My Orders<span class="mi-arrow">\u203A</span></a>' +
          '<a class="menu-item" href="#/wishlist"><span class="mi-icon">\u2665</span>' + t("wishlist") + '<span class="mi-arrow">\u203A</span></a>' +
          '<a class="menu-item" href="#/cart"><span class="mi-icon">\u{1F6D2}</span>' + t("cart") + '<span class="mi-arrow">\u203A</span></a>' +
          '<button class="menu-item" style="width:100%;background:none;border:0;text-align:left;border-bottom:1px solid var(--border)" data-action="logout"><span class="mi-icon">\u{1F6AA}</span>' + t("logout") + '<span class="mi-arrow">\u203A</span></button>' +
        "</div>" +
      "</div>" +
      '<div>' +
        '<div class="card"><div class="card-title">Profile Details</div>' +
          '<form data-form="profile">' +
            '<div class="field"><label>Full name</label><input class="input" name="name" value="' + escapeHtml(u.name) + '" required></div>' +
            '<div class="field"><label>Email address</label><input class="input" value="' + escapeHtml(u.email) + '" disabled></div>' +
            '<div class="field"><label>Mobile number</label><input class="input" name="phone" value="' + escapeHtml(u.phone) + '" maxlength="10" required></div>' +
            '<div class="field-row"><div class="field"><label>New password (optional)</label><input class="input" type="password" name="password" minlength="6" placeholder="Leave blank to keep"></div>' +
            '<div class="field"><label>Current password</label><input class="input" type="password" name="currentPassword" placeholder="Required to change"></div></div>' +
            '<button class="btn" type="submit">Save Changes</button>' +
          "</form>" +
        "</div>" +
        '<div class="card"><div class="card-title">Saved Addresses <button class="btn small secondary" data-action="open-address">+ Add Address</button></div>' + addressHtml + "</div>" +
      "</div>" +
    "</div>";
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
  const otpMode = state.otpMode === "otp";
  const body = otpMode
    ? '<div class="field"><label>Email address</label><input class="input" name="email" type="email" value="' + escapeHtml(state.otpEmail) + '" required ' + (state.otpSent ? "readonly" : "") + '></div>' +
      (state.otpSent
        ? '<div class="field"><label>Enter OTP</label><input class="input" name="otp" inputmode="numeric" maxlength="6" placeholder="6-digit OTP" required></div>' +
          '<div class="field"><label>Your name (for new accounts)</label><input class="input" name="name" placeholder="Full name"></div>' +
          '<button class="btn block" type="submit">Verify & Login</button>' +
          '<p class="muted small center" style="margin-top:8px">Demo OTP: <strong>' + escapeHtml(state.demoOtp || "check server log") + "</strong></p>"
        : '<button class="btn block" type="submit">Send OTP</button>')
    : '<div class="field"><label>Email address</label><input class="input" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>' +
      '<div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password"></div>' +
      '<button class="btn block" type="submit">' + t("login") + "</button>" +
      '<div class="row between" style="margin-top:10px"><button type="button" class="link small" data-action="switch-otp">Login with OTP</button><a class="link small" href="#/forgot">Forgot password?</a></div>';

  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>' + (otpMode ? "OTP Login" : "Welcome back") + "</h1>" +
      '<p class="muted small">Login to your Aamart account to continue shopping.</p>' +
      '<div class="tabs"><button type="button" class="' + (!otpMode ? "active" : "") + '" data-action="login-tab" data-mode="password">Password</button><button type="button" class="' + (otpMode ? "active" : "") + '" data-action="login-tab" data-mode="otp">OTP</button></div>' +
      '<form data-form="' + (otpMode ? (state.otpSent ? "otp-verify" : "otp-send") : "login") + '" data-next="' + escapeHtml(next) + '">' + body + "</form>" +
      '<div class="auth-alt">New to Aamart? <a href="#/register">Create an account</a></div>' +
      '<div class="auth-alt" style="margin-top:6px"><a href="#/">Continue as guest</a></div>' +
    "</div></div>";
}

function renderRegister(token, route) {
  if (isLoggedIn()) { go("/account"); return; }
  const next = route.query.next || "/";
  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
      '<h1>Create your account</h1><p class="muted small">Join Aamart for a faster checkout experience.</p>' +
      '<form data-form="register" data-next="' + escapeHtml(next) + '">' +
        '<div class="field"><label>Full name</label><input class="input" name="name" required placeholder="Your full name"></div>' +
        '<div class="field"><label>Email address</label><input class="input" name="email" type="email" required placeholder="you@example.com"></div>' +
        '<div class="field"><label>Mobile number</label><input class="input" name="phone" inputmode="numeric" maxlength="10" required placeholder="10-digit mobile number"></div>' +
        '<div class="field"><label>Password</label><input class="input" name="password" type="password" minlength="6" required placeholder="At least 6 characters"></div>' +
        '<button class="btn block" type="submit">' + t("register") + "</button>" +
      "</form>" +
      '<div class="auth-alt">Already have an account? <a href="#/login">Login</a></div>' +
    "</div></div>";
}

function renderForgot(token, route) {
  const body = state.resetSent
    ? '<div class="field"><label>Email address</label><input class="input" name="email" type="email" value="' + escapeHtml(state.otpEmail) + '" readonly></div>' +
      '<div class="field"><label>Reset OTP</label><input class="input" name="otp" inputmode="numeric" maxlength="6" required placeholder="6-digit OTP"></div>' +
      '<div class="field"><label>New password</label><input class="input" name="password" type="password" minlength="6" required placeholder="At least 6 characters"></div>' +
      '<button class="btn block" type="submit">Reset Password</button>' +
      '<p class="muted small center" style="margin-top:8px">Demo OTP: <strong>' + escapeHtml(state.demoOtp || "check server log") + "</strong></p>"
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
   Address modal
   --------------------------------------------------------------------------- */
function openAddressModal(address) {
  const a = address || {};
  showModal(
    '<div class="modal-head"><h3>' + (address ? "Edit Address" : "Add New Address") + '</h3><button class="modal-close" data-action="close-modal">\u00D7</button></div>' +
    '<form data-form="address" data-id="' + escapeHtml(a.id || "") + '">' +
      '<div class="field"><label>Full name</label><input class="input" name="name" value="' + escapeHtml(a.name || "") + '" required></div>' +
      '<div class="field"><label>Mobile number</label><input class="input" name="phone" inputmode="numeric" maxlength="10" value="' + escapeHtml(a.phone || "") + '" required></div>' +
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
    try { await api("/api/addresses/" + id, { method: "DELETE" }); render(); }
    catch (e) { showToast(e.message, "error"); }
    return;
  }
  if (action === "close-modal") { closeModal(); return; }
  if (action === "logout") {
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
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (el.tagName === "A" && action === "banner-dot") e.preventDefault();
  handleAction(action, el).catch((err) => showToast(err.message || "Something went wrong", "error"));
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
      const data = await api("/api/auth/login", { method: "POST", body: { email: fd.get("email"), password: fd.get("password") }, auth: false });
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
      saveToken(data.token, data.user);
      await afterLogin();
      showToast("Account created successfully!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "otp-send") {
      setBusy(true, "Sending OTP...");
      const data = await api("/api/auth/send-otp", { method: "POST", auth: false, body: { email: fd.get("email") } });
      state.otpEmail = String(fd.get("email"));
      state.otpSent = true;
      state.demoOtp = data.demoOtp;
      showToast("OTP sent to your email", "success");
      render();
      return;
    }

    if (kind === "otp-verify") {
      setBusy(true, "Verifying...");
      const data = await api("/api/auth/verify-otp", { method: "POST", auth: false, body: { email: fd.get("email"), otp: fd.get("otp"), name: fd.get("name") } });
      saveToken(data.token, data.user);
      state.otpSent = false;
      await afterLogin();
      showToast("Logged in successfully!", "success");
      go(next && next !== "undefined" ? next : "/");
      return;
    }

    if (kind === "forgot-send") {
      setBusy(true, "Sending OTP...");
      const data = await api("/api/auth/forgot-password", { method: "POST", auth: false, body: { email: fd.get("email") } });
      state.otpEmail = String(fd.get("email"));
      state.resetSent = true;
      state.demoOtp = data.demoOtp || "";
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
      state.user = data.user;
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
      if (addressId) await api("/api/addresses/" + addressId, { method: "PUT", body });
      else await api("/api/addresses", { method: "POST", body });
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
function setupSearch() {
  const form = $("#search-form");
  const input = $("#search-input");
  const box = $("#suggestions");
  if (!form || !input || !box) return;
  let timer = null;
  let seq = 0;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    box.classList.add("hidden");
    box.innerHTML = "";
    go(q ? "/products?q=" + encodeURIComponent(q) : "/products");
    input.blur();
  });

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        const data = await api("/api/products?q=" + encodeURIComponent(q) + "&limit=6", { auth: false });
        if (mySeq !== seq) return;
        if (!data.products.length) {
          box.innerHTML = '<div class="suggestion-empty">No matches for "' + escapeHtml(q) + '"</div>';
        } else {
          box.innerHTML = data.products.map((p) =>
            '<a class="suggestion" href="#/product/' + p.id + '"><img src="' + escapeHtml(p.image) + '" alt=""><div><div class="s-title">' + escapeHtml(p.title) + '</div><div class="s-price">' + money(p.price) + " \u00B7 " + escapeHtml(p.category) + "</div></div></a>"
          ).join("") + '<a class="suggestion" href="#/products?q=' + encodeURIComponent(q) + '"><div class="s-title" style="color:var(--blue)">See all results for "' + escapeHtml(q) + '" \u203A</div></a>';
        }
        box.classList.remove("hidden");
      } catch {}
    }, 220);
  });

  input.addEventListener("focus", () => { if (box.innerHTML) box.classList.remove("hidden"); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) box.classList.add("hidden");
  });
}

function setupLang() {
  const btn = $("#lang-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    state.lang = state.lang === "hi" ? "en" : "hi";
    localStorage.setItem("aamart_lang", state.lang);
    updateChrome(state.route);
    render();
  });
}

/* ---------------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------------- */
async function boot() {
  setupSearch();
  setupLang();
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/";
  if (state.token) await afterLogin();
  await render();
}

boot();

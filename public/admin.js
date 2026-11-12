"use strict";

(function () {
  var TOKEN_KEY = "aamart_admin_token";
  var ADMIN_KEY = "aamart_admin";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = {
    token: "",
    admin: null,
    view: "",
    products: [],
    orders: [],
    dashboardRange: "7d",
    cache: {},
  };
  var searchRequest = 0;
  var searchTimer = null;

  var STATUS_FLOW = ["Ordered", "Packed", "Shipped", "Out for Delivery", "Delivered"];

  var FILTER_VALUE_KINDS = [
    { key: "gender", label: "Gender" },
    { key: "color", label: "Colour" },
    { key: "size", label: "Size" },
    { key: "age_group", label: "Age group" },
    { key: "offers", label: "Offers" },
  ];

  var NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ["super", "manager"], section: "Manage" },
    { id: "products", label: "Products", icon: "products", roles: ["super", "manager"] },
    { id: "orders", label: "Orders", icon: "orders", roles: ["super", "manager"] },
    { id: "reviews", label: "Reviews", icon: "reviews", roles: ["super", "manager"] },
    { id: "categories", label: "Categories", icon: "categories", roles: ["super"], section: "Store setup" },
    { id: "brands", label: "Brands", icon: "brands", roles: ["super"] },
    { id: "filters", label: "Filters", icon: "filters", roles: ["super"] },
    { id: "banners", label: "Banners", icon: "banners", roles: ["super"] },
    { id: "coupons", label: "Coupons", icon: "coupons", roles: ["super"] },
    { id: "customers", label: "Customers", icon: "customers", roles: ["super"], section: "People" },
    { id: "admins", label: "Admins", icon: "admins", roles: ["super"] },
    { id: "settings", label: "Settings", icon: "settings", roles: ["super"], section: "System" },
    { id: "inventory", label: "Inventory", icon: "inventory", roles: ["super"] },
    { id: "logs", label: "Activity logs", icon: "logs", roles: ["super"] },
  ];

  var VIEW_META = {
    dashboard: { title: "Dashboard", sub: "Store performance at a glance" },
    products: { title: "Products", sub: "Create, edit and manage your catalog" },
    orders: { title: "Orders", sub: "Track and update customer orders" },
    reviews: { title: "Reviews", sub: "Moderate customer feedback" },
    categories: { title: "Categories", sub: "Organise your catalog structure" },
    brands: { title: "Brands", sub: "Manage product brands" },
    filters: { title: "Filters", sub: "Control filter groups and values shown to customers" },
    banners: { title: "Banners", sub: "Homepage promotional banners" },
    coupons: { title: "Coupons", sub: "Discount codes and offers" },
    customers: { title: "Customers", sub: "Registered store customers" },
    admins: { title: "Admins", sub: "Team accounts and permissions" },
    settings: { title: "Settings", sub: "Store, delivery and payment configuration" },
    inventory: { title: "Inventory", sub: "Recent stock movements" },
    logs: { title: "Activity logs", sub: "Security and admin audit trail" },
  };

  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    products: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    orders: '<path d="M6 2l1.5 3h9L18 2"/><path d="M4 6h16l-1.2 14H5.2L4 6z"/><path d="M9 10a3 3 0 006 0"/>',
    reviews: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/>',
    categories: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
    brands: '<path d="M20 12l-8 8-9-9V3h8l9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    filters: '<path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/>',
    banners: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 20"/>',
    coupons: '<path d="M3 9V7a2 2 0 012-2h14a2 2 0 012 2v2a3 3 0 000 6v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a3 3 0 000-6z"/><path d="M13 5v14"/>',
    customers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 5.5a3 3 0 010 5.5"/><path d="M18 20a5.5 5.5 0 00-2-4.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    admins: '<path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/>',
    inventory: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/>',
    logs: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h8.8a2 2 0 002-1.6L22 7H6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15l4-4 3 2 5-6"/>',
    bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.5 21h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 20"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V4h9l8.6 8.6a1 1 0 010 1.4z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    arrowRight: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 4v16"/>',
    store: '<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6"/><path d="M8 20v-6h8v6"/>',
    spark: '<path d="M4 17l4-5 3 2 4-7 5 4"/>',
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(value) {
    var n = Number(value || 0);
    return "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function num(value) {
    return Number(value || 0).toLocaleString("en-IN");
  }

  function dt(value) {
    if (!value) return "\u2014";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function dateOnly(value) {
    if (!value) return "\u2014";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function toLocalInput(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function statusBadge(status) {
    var s = String(status || "");
    var cls = "blue";
    var key = s.toLowerCase();
    if (["active", "approved", "delivered", "success", "paid"].indexOf(key) >= 0) cls = "green";
    else if (["inactive", "rejected", "cancelled", "failed"].indexOf(key) >= 0) cls = "red";
    else if (["pending", "ordered", "packed"].indexOf(key) >= 0) cls = "amber";
    return '<span class="badge ' + cls + '">' + esc(s) + "</span>";
  }

  function roleLabel(role) {
    return role === "super" ? "Super Admin" : "Manager";
  }

  function icon(name, size) {
    var s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  function getCookie(name) {
    var parts = String(document.cookie || "").split(";");
    for (var i = 0; i < parts.length; i++) {
      var idx = parts[i].indexOf("=");
      if (idx > 0 && parts[i].slice(0, idx).trim() === name) {
        try { return decodeURIComponent(parts[i].slice(idx + 1).trim()); } catch (e) { return parts[i].slice(idx + 1).trim(); }
      }
    }
    return "";
  }

  async function ensureCsrf() {
    if (getCookie("csrf")) return;
    try { await fetch("/api/health", { credentials: "same-origin" }); } catch (e) {}
  }

  async function api(path, options) {
    var opts = options || {};
    await ensureCsrf();
    var method = opts.method || (opts.body !== undefined ? "POST" : "GET");
    var headers = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (state.token) headers.Authorization = "Bearer " + state.token;
    if (["GET", "HEAD"].indexOf(method) < 0) headers["X-CSRF-Token"] = getCookie("csrf");
    var res;
    try {
      res = await fetch(path, {
        method: method,
        headers: headers,
        credentials: "same-origin",
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      var netErr = new Error("Network error. Please check that the server is running.");
      netErr.status = 0;
      throw netErr;
    }
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text }; }
    if (!res.ok) {
      var err = new Error((data && data.error) || "Request failed (" + res.status + ")");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message, type) {
    var root = $("#toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast " + (type || "success");
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 3400);
  }

  async function logout() {
    if (state.token) {
      try {
        await ensureCsrf();
        await fetch("/api/admin/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + state.token, "X-CSRF-Token": getCookie("csrf") },
          credentials: "same-origin",
        });
      } catch (e) {}
    }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ADMIN_KEY);
    } catch (e) {}
    window.location.replace("/admin");
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  function renderNav() {
    var nav = $("#nav");
    if (!nav) return;
    var items = NAV.filter(function (n) { return n.roles.indexOf(state.admin.role) >= 0; });
    var html = "";
    var lastSection = "";
    items.forEach(function (n) {
      if (n.section && n.section !== lastSection) {
        html += '<div class="nav-label">' + esc(n.section) + "</div>";
        lastSection = n.section;
      }
      html += '<a class="nav-item" href="#/' + n.id + '" data-view="' + n.id + '">' + icon(n.icon) + "<span>" + esc(n.label) + "</span></a>";
    });
    html += '<div class="nav-label">Account</div>' +
      '<a class="nav-item" href="/" target="_blank" rel="noopener">' + icon("store") + "<span>View Storefront</span></a>" +
      '<button class="nav-item nav-action" type="button" data-action="change-password">' + icon("lock") + "<span>Change Password</span></button>" +
      '<button class="nav-item nav-action" type="button" data-action="logout">' + icon("logout") + "<span>Sign Out</span></button>";
    nav.innerHTML = html;
  }

  function setActiveNav() {
    $$(".nav-item[data-view]").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-view") === state.view);
    });
  }

  function initials(name) {
    return String(name || "A").trim().split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0);
    }).join("").toUpperCase() || "A";
  }

  function setAdminChrome() {
    var admin = state.admin;
    var name = admin.name || admin.username || "Admin";
    var avatar = $("#admin-avatar");
    if (avatar) avatar.textContent = initials(name);
    var nameEl = $("#admin-name");
    if (nameEl) nameEl.textContent = name;
    var roleEl = $("#admin-role");
    if (roleEl) roleEl.textContent = roleLabel(admin.role);
    var chip = $("#admin-chip");
    if (chip) chip.innerHTML = '<span class="dot"></span>' + esc(name) + " \u00B7 " + esc(roleLabel(admin.role));
  }

  function closeNotifications() {
    var panel = $("#notif-panel");
    var btn = $("#notif-btn");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function closeAdminMenu() {
    var panel = $("#admin-menu-panel");
    var btn = $("#admin-menu-btn");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function closeSearchResults() {
    var results = $("#search-results");
    if (!results) return;
    results.hidden = true;
    results.innerHTML = "";
  }

  async function toggleNotifications() {
    var panel = $("#notif-panel");
    var btn = $("#notif-btn");
    if (!panel || !btn) return;
    if (!panel.hidden) { closeNotifications(); return; }
    closeAdminMenu();
    closeSearchResults();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    panel.innerHTML = '<div class="panel-head"><strong>Notifications</strong><small>Checking for updates\u2026</small></div>';
    try {
      var stats = state.cache.dashboardStats;
      if (!stats) stats = await api("/api/admin/stats?range=" + encodeURIComponent(state.dashboardRange));
      state.cache.dashboardStats = stats;
      updateNotificationBadge(stats);
      panel.innerHTML = notificationsHtml(stats);
    } catch (err) {
      panel.innerHTML = '<div class="panel-head"><strong>Notifications</strong><small>Unable to load notifications.</small></div>';
    }
  }

  function notificationsHtml(stats) {
    var items = [
      { count: stats.pendingOrders, label: "Pending orders", note: "Awaiting fulfilment", href: "#/orders", icon: "clock", tone: "purple" },
      { count: stats.pendingReviews, label: "Pending reviews", note: "Waiting for moderation", href: "#/reviews", icon: "star", tone: "pink" },
      { count: stats.lowStock, label: "Low stock products", note: "At or below the stock threshold", href: "#/products", icon: "box", tone: "orange" },
      { count: stats.outOfStock, label: "Out of stock products", note: "Needs restocking", href: "#/products", icon: "box", tone: "red" },
    ].filter(function (item) { return Number(item.count || 0) > 0; });
    var html = '<div class="panel-head"><strong>Notifications</strong><small>Live items that need attention.</small></div>';
    if (!items.length) return html + '<div class="search-empty">You\u2019re all caught up.</div>';
    return html + items.map(function (item) {
      return '<a class="notif-item" href="' + item.href + '" data-action="close-notifications">' +
        '<span class="notif-item-icon ' + item.tone + '">' + icon(item.icon, 16) + "</span>" +
        '<span class="notif-item-body"><strong>' + esc(item.label) + "</strong><small>" + esc(item.note) + "</small></span>" +
        '<span class="notif-item-count">' + num(item.count) + "</span></a>";
    }).join("");
  }

  function toggleAdminMenu() {
    var panel = $("#admin-menu-panel");
    var btn = $("#admin-menu-btn");
    if (!panel || !btn) return;
    var open = panel.hidden;
    closeNotifications();
    closeSearchResults();
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function bindTopbar() {
    var input = $("#global-search");
    if (!input) return;
    input.addEventListener("input", function () {
      var term = input.value.trim();
      clearTimeout(searchTimer);
      if (!term) { closeSearchResults(); return; }
      searchTimer = setTimeout(function () { runGlobalSearch(term); }, 220);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        input.value = "";
        closeSearchResults();
        input.blur();
      } else if (event.key === "Enter") {
        event.preventDefault();
        var first = $("#search-results .search-result");
        if (first) first.click();
      }
    });
    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  async function runGlobalSearch(term) {
    var results = $("#search-results");
    if (!results) return;
    var seq = ++searchRequest;
    results.hidden = false;
    results.innerHTML = '<div class="search-empty">Searching\u2026</div>';
    try {
      var data = await Promise.all([
        api("/api/admin/products?limit=5&q=" + encodeURIComponent(term)),
        api("/api/admin/orders?q=" + encodeURIComponent(term)),
      ]);
      if (seq !== searchRequest) return;
      var products = data[0].products || [];
      var orders = (data[1].orders || []).slice(0, 4);
      state.cache.searchOrders = data[1].orders || [];
      var html = "";
      if (products.length) {
        html += '<div class="search-group-label">Products</div>' + products.map(function (p) {
          return '<button class="search-result" type="button" data-action="search-product" data-id="' + esc(p.id) + '">' +
            '<img src="' + esc(p.image || "/img/placeholder.svg") + '" alt="">' +
            '<span class="search-result-main"><strong>' + esc(p.title) + "</strong><small>" + esc(p.categoryName || p.category || "Uncategorised") +
            (p.sku ? " \u00B7 " + esc(p.sku) : "") + '</small></span><span class="search-result-meta">' + money(p.price) + "</span></button>";
        }).join("");
      }
      if (orders.length) {
        html += '<div class="search-group-label">Orders</div>' + orders.map(function (o) {
          return '<button class="search-result" type="button" data-action="search-order" data-id="' + esc(o.id) + '">' +
            '<span class="search-result-icon">' + icon("orders", 16) + "</span>" +
            '<span class="search-result-main"><strong>' + esc(o.orderNo) + "</strong><small>" + esc(o.customer && o.customer.name) +
            (o.customer && o.customer.phone ? " \u00B7 " + esc(o.customer.phone) : "") + '</small></span><span class="search-result-meta">' + money(o.payable) + "</span></button>";
        }).join("");
      }
      results.innerHTML = html || '<div class="search-empty">No results for \u201C' + esc(term) + '\u201D.</div>';
    } catch (err) {
      if (seq !== searchRequest) return;
      results.innerHTML = '<div class="search-empty">' + esc(err.message || "Search failed.") + "</div>";
    }
  }

  async function openOrderById(id) {
    var order = state.orders.filter(function (o) { return o.id === id; })[0] ||
      (state.cache.searchOrders || []).filter(function (o) { return o.id === id; })[0];
    if (!order) {
      try {
        var data = await api("/api/admin/orders");
        order = (data.orders || []).filter(function (o) { return o.id === id; })[0];
      } catch (err) {
        toast(err.message, "error");
        return;
      }
    }
    if (!order) { toast("Order not found.", "error"); return; }
    state.orders = [order];
    openOrderModal(id);
  }

  function closeSidebar() {
    var shell = $("#admin-shell");
    var scrim = $("#sidebar-scrim");
    var btn = $("#menu-btn");
    if (shell) shell.classList.remove("nav-open");
    if (scrim) scrim.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    var shell = $("#admin-shell");
    var scrim = $("#sidebar-scrim");
    var btn = $("#menu-btn");
    if (!shell) return;
    var open = shell.classList.toggle("nav-open");
    if (scrim) scrim.hidden = !open;
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------
  function initialView() {
    if (location.pathname.indexOf("/admin/products") === 0) return "products";
    return "dashboard";
  }

  function normalizePath() {
    if (!state.admin) return;
    if (state.admin.role === "manager" && location.pathname === "/admin/amirhamza") {
      history.replaceState(null, "", "/admin/aditism");
    } else if (state.admin.role === "super" && location.pathname === "/admin/aditism") {
      history.replaceState(null, "", "/admin/amirhamza");
    }
  }

  function route() {
    if (!state.admin) return;
    var hash = location.hash.replace(/^#\/?/, "").split("?")[0];
    var requested = hash || initialView();
    var allowed = NAV.filter(function (n) {
      return n.id === requested && n.roles.indexOf(state.admin.role) >= 0;
    })[0];
    var view = allowed ? requested : "dashboard";
    state.view = view;

    var meta = VIEW_META[view];
    var title = $("#page-title");
    var sub = $("#page-sub");
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.sub;
    document.title = meta.title + " - Aamart Admin";
    setActiveNav();
    closeSidebar();

    var container = $("#view");
    container.innerHTML = '<div class="loading"><span class="spinner"></span> Loading\u2026</div>';
    container.focus({ preventScroll: true });

    var render = VIEWS[view];
    Promise.resolve()
      .then(render)
      .catch(function (err) {
        if (err && err.status === 401) { logout(); return; }
        container.innerHTML = errorPanel(err && err.message ? err.message : "Something went wrong.");
      });
  }

  // ---------------------------------------------------------------------------
  // Shared HTML
  // ---------------------------------------------------------------------------
  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div><h2>' + esc(title) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + "</div>" +
      (actions ? '<div class="page-actions">' + actions + "</div>" : "") + "</div>";
  }

  function errorPanel(message) {
    return '<div class="card"><div class="empty"><strong>Unable to load this page</strong>' +
      esc(message) + '<div style="margin-top:14px"><button class="btn primary" type="button" data-action="retry">Try again</button></div></div></div>';
  }

  function emptyState(title, note) {
    return '<div class="empty"><strong>' + esc(title) + "</strong>" + esc(note || "") + "</div>";
  }

  function modalHead(title, sub) {
    return '<div class="modal-head"><div><h3>' + esc(title) + "</h3>" + (sub ? "<p>" + esc(sub) + "</p>" : "") +
      '</div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">&times;</button></div>';
  }

  var lastFocused = null;

  function openModal(html, wide) {
    var root = $("#modal-root");
    lastFocused = document.activeElement;
    root.innerHTML = '<div class="modal-overlay" data-action="modal-backdrop"><div class="modal' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true">' + html + "</div></div>";
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      var first = root.querySelector("input:not([type=hidden]), select, textarea, button");
      if (first) first.focus();
    }, 40);
  }

  function closeModal() {
    var root = $("#modal-root");
    if (root) root.innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    lastFocused = null;
  }

  document.addEventListener("keydown", function (event) {
    var modal = $("#modal-root .modal");
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = Array.from(modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
      .filter(function (el) { return el.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function showFormError(form, message) {
    var box = form.querySelector('[data-role="form-error"]');
    if (!box) { toast(message, "error"); return; }
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
  }

  function clearFormError(form) {
    var box = form.querySelector('[data-role="form-error"]');
    if (box) { box.hidden = true; box.textContent = ""; }
  }

  function btnLabel(button, text) {
    button.dataset.original = button.dataset.original || button.innerHTML;
    button.disabled = true;
    button.textContent = text;
  }

  function btnReset(button) {
    if (!button) return;
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  async function viewDashboard() {
    var range = state.dashboardRange || "7d";
    var stats = await api("/api/admin/stats?range=" + encodeURIComponent(range));
    state.cache.dashboardStats = stats;
    state.orders = stats.recentOrders || [];
    updateNotificationBadge(stats);

    var html = dashboardHeader(stats) + statsGrid(stats) +
      '<div class="dash-grid">' + salesCard(stats) + recentOrdersCard(stats) + "</div>" +
      quickActionsCard() +
      '<div class="dash-bottom">' + topProductsCard(stats) + lowStockCard(stats) + "</div>";
    $("#view").innerHTML = html;
  }

  function dashboardHeader(stats) {
    var adminName = (state.admin && (state.admin.name || state.admin.username)) || "Admin";
    var generated = stats.generatedAt ? new Date(stats.generatedAt) : new Date();
    var updated = isNaN(generated.getTime()) ? "\u2014" : generated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return '<div class="dash-head">' +
      '<div class="dash-head-left"><span class="dash-title-icon">' + icon("chart", 20) + "</span>" +
      "<div><h2>Dashboard</h2><p>Welcome back, " + esc(adminName) + "! Here's your store overview.</p></div></div>" +
      '<div class="dash-head-right">' +
      '<span class="store-status"><span class="dot"></span>Store Online</span>' +
      '<span class="dash-divider"></span>' +
      '<span>Last updated <strong>' + esc(updated) + "</strong></span>" +
      '<button class="refresh-btn" type="button" data-action="dashboard-refresh">' + icon("refresh", 14) + "Refresh</button>" +
      "</div></div>";
  }

  function statsGrid(stats) {
    var series = stats.salesSeries || {};
    return '<div class="stats-grid">' +
      statCard("Total Sales", money(stats.totalSales), num(stats.totalOrders) + " orders", "blue", "cart", miniSparkline(series.revenue)) +
      statCard("Pending Orders", num(stats.pendingOrders), "Awaiting fulfilment", "purple", "clock") +
      statCard("Delivered Orders", num(stats.deliveredOrders), "Completed orders", "green", "check") +
      statCard("Total Customers", num(stats.customers), "Registered users", "orange", "customers") +
      statCard("Total Products", num(stats.products), num(stats.lowStock) + " low \u00B7 " + num(stats.outOfStock) + " out of stock", "cyan", "box") +
      statCard("Pending Reviews", num(stats.pendingReviews), "Pending moderation", "pink", "star") +
      "</div>";
  }

  function statCard(label, value, note, tone, iconName, extra) {
    return '<div class="stat">' +
      '<span class="stat-icon ' + esc(tone) + '">' + icon(iconName, 20) + "</span>" +
      (extra || "") +
      '<div class="stat-value">' + value + "</div>" +
      '<div class="stat-label">' + esc(label) + "</div>" +
      '<div class="stat-note">' + esc(note || "") + "</div></div>";
  }

  function miniSparkline(values) {
    var data = (values || []).map(Number);
    if (data.length < 2) return "";
    var max = Math.max.apply(null, data.concat([0]));
    if (!max) return "";
    var w = 70;
    var h = 30;
    var points = data.map(function (value, i) {
      var x = (i / (data.length - 1)) * w;
      var y = h - 2 - (value / max) * (h - 4);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return '<svg class="stat-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" fill="none" aria-hidden="true"><polyline points="' + points + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function salesCard(stats) {
    var series = stats.salesSeries || { range: "7d", labels: [], revenue: [], orders: [] };
    var selected = series.range || state.dashboardRange;
    var tabs = [["7d", "7 Days"], ["30d", "30 Days"], ["12m", "12 Months"]].map(function (pair) {
      return '<button class="range-tab' + (selected === pair[0] ? " active" : "") + '" type="button" data-action="dashboard-range" data-range="' +
        pair[0] + '" aria-pressed="' + (selected === pair[0] ? "true" : "false") + '">' + pair[1] + "</button>";
    }).join("");
    return '<section class="dash-card"><div class="dash-card-head"><div><h3>Sales Overview</h3><p>Your store performance over time.</p></div>' +
      '<div class="range-tabs">' + tabs + "</div></div>" +
      '<div class="chart-legend"><span><i class="revenue"></i>Revenue</span><span><i class="orders"></i>Orders</span></div>' +
      '<div class="chart-wrap">' + salesChart(series) + "</div></section>";
  }

  function salesChart(series) {
    var labels = series.labels || [];
    var revenue = (series.revenue || []).map(Number);
    var orders = (series.orders || []).map(Number);
    var maxRevenue = Math.max.apply(null, revenue.concat([0]));
    var maxOrders = Math.max.apply(null, orders.concat([0]));
    if (!labels.length || !maxRevenue) {
      return '<div class="chart-empty">' + icon("chart", 30) +
        "<strong>No sales in this period</strong><span>Sales will appear here once orders start coming in.</span></div>";
    }

    var W = 620;
    var H = 230;
    var left = 48;
    var right = 12;
    var top = 14;
    var bottom = 30;
    var innerW = W - left - right;
    var innerH = H - top - bottom;
    var xAt = function (i) { return labels.length <= 1 ? left + innerW / 2 : left + (i / (labels.length - 1)) * innerW; };
    var yRevenue = function (value) { return top + innerH - (value / maxRevenue) * innerH; };
    var yOrders = function (value) { return top + innerH - (maxOrders ? (value / maxOrders) * innerH : 0); };
    var svg = '<svg class="sales-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Sales overview chart">';

    for (var g = 0; g <= 3; g += 1) {
      var gy = top + (innerH / 3) * g;
      var gv = maxRevenue * (1 - g / 3);
      svg += '<line class="chart-grid-line" x1="' + left + '" y1="' + gy.toFixed(1) + '" x2="' + (W - right) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text class="chart-axis-label" x="' + (left - 8) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + esc(moneyShort(gv)) + "</text>";
    }

    var tickStep = labels.length > 14 ? Math.ceil(labels.length / 6) : 1;
    var tickIndexes = [];
    for (var t = 0; t < labels.length; t += tickStep) tickIndexes.push(t);
    if (tickIndexes[tickIndexes.length - 1] !== labels.length - 1) tickIndexes.push(labels.length - 1);
    tickIndexes.forEach(function (i) {
      var tx = xAt(i);
      svg += '<line class="chart-grid-line" x1="' + tx.toFixed(1) + '" y1="' + top + '" x2="' + tx.toFixed(1) + '" y2="' + (top + innerH) + '"/>' +
        '<text class="chart-axis-label" x="' + tx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[i]) + "</text>";
    });

    var revenuePoints = revenue.map(function (value, i) { return xAt(i).toFixed(1) + "," + yRevenue(value).toFixed(1); });
    svg += '<polygon class="chart-area" points="' + left + "," + (top + innerH) + " " + revenuePoints.join(" ") + " " + (W - right) + "," + (top + innerH) + '"/>';
    svg += '<polyline class="chart-line-revenue" points="' + revenuePoints.join(" ") + '"/>';
    if (maxOrders) {
      svg += '<polyline class="chart-line-orders" points="' + orders.map(function (value, i) {
        return xAt(i).toFixed(1) + "," + yOrders(value).toFixed(1);
      }).join(" ") + '"/>';
    }

    revenue.forEach(function (value, i) {
      svg += '<g class="chart-point"><circle cx="' + xAt(i).toFixed(1) + '" cy="' + yRevenue(value).toFixed(1) + '" r="3.2">' +
        "<title>" + esc(labels[i]) + ": " + esc(money(value)) + "</title></circle></g>";
    });
    if (maxOrders) {
      orders.forEach(function (value, i) {
        svg += '<g class="chart-point orders"><circle cx="' + xAt(i).toFixed(1) + '" cy="' + yOrders(value).toFixed(1) + '" r="2.8">' +
          "<title>" + esc(labels[i]) + ": " + num(value) + " orders</title></circle></g>";
      });
    }
    return svg + "</svg>";
  }

  function moneyShort(value) {
    var n = Number(value || 0);
    if (n >= 10000000) return "\u20B9" + (n / 10000000).toFixed(1) + "Cr";
    if (n >= 100000) return "\u20B9" + (n / 100000).toFixed(1) + "L";
    if (n >= 1000) return "\u20B9" + (n / 1000).toFixed(1) + "k";
    return "\u20B9" + Math.round(n);
  }

  function recentOrdersCard(stats) {
    var recent = stats.recentOrders || [];
    var body = "";
    if (!recent.length) {
      body = '<div class="recent-empty">' + icon("bag", 30) + "<strong>No orders yet.</strong><span>New customer orders will appear here.</span></div>";
    } else {
      body = '<div class="recent-table"><table><thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
        recent.map(function (o) {
          return "<tr><td><button class=\"link-btn order-link\" type=\"button\" data-action=\"dashboard-order\" data-id=\"" + esc(o.id) + "\">" + esc(o.orderNo) + "</button></td>" +
            '<td><span class="cust-name">' + esc(o.customer && o.customer.name) + '</span><span class="cust-phone">' + esc(o.customer && o.customer.phone) + "</span></td>" +
            '<td class="mono amount">' + money(o.payable) + "</td><td>" + statusBadge(o.status) + "</td>" +
            '<td class="muted nowrap">' + dateOnly(o.createdAt) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    return '<section class="dash-card"><div class="dash-card-head"><div><h3>Recent Orders</h3><p>Latest customer orders.</p></div>' +
      '<a class="link-btn" href="#/orders">View All Orders</a></div>' + body + "</section>";
  }

  function quickActionsCard() {
    return '<section class="dash-card quick-card">' +
      '<div class="quick-head"><h3>Quick Actions</h3><p>Manage your store efficiently.</p></div>' +
      '<div class="quick-actions">' +
      '<button class="quick-action" type="button" data-action="new-product"><span class="quick-action-icon blue">' + icon("plus", 18) + '</span><span class="quick-action-body"><strong>Add Product</strong><small>Create a new product.</small></span>' + icon("arrowRight", 16) + "</button>" +
      '<a class="quick-action" href="#/orders"><span class="quick-action-icon green">' + icon("cart", 18) + '</span><span class="quick-action-body"><strong>Manage Orders</strong><small>View all orders.</small></span>' + icon("arrowRight", 16) + "</a>" +
      '<a class="quick-action" href="#/banners"><span class="quick-action-icon orange">' + icon("image", 18) + '</span><span class="quick-action-body"><strong>Upload Banner</strong><small>Add new banner.</small></span>' + icon("arrowRight", 16) + "</a>" +
      '<a class="quick-action" href="#/coupons"><span class="quick-action-icon purple">' + icon("tag", 18) + '</span><span class="quick-action-body"><strong>Create Coupon</strong><small>Start a new offer.</small></span>' + icon("arrowRight", 16) + "</a>" +
      "</div></section>";
  }

  function topProductsCard(stats) {
    var products = stats.topProducts || [];
    var body = "";
    if (!products.length) {
      body = '<div class="dash-empty"><strong>No product sales yet</strong>Top products will appear here after orders are placed.</div>';
    } else {
      body = '<div class="dash-table"><table><thead><tr><th>Product</th><th>Category</th><th>Units Sold</th><th>Revenue</th></tr></thead><tbody>' +
        products.map(function (p) {
          var name = p.productId
            ? '<button class="link-btn product-link" type="button" data-action="edit-product" data-id="' + esc(p.productId) + '"><strong>' + esc(p.title) + "</strong></button>"
            : "<strong>" + esc(p.title) + "</strong>";
          return '<tr><td><div class="product-cell"><img src="' + esc(p.image || "/img/placeholder.svg") + '" alt="">' +
            "<div>" + name + "<small>" + esc(p.category || "Uncategorised") + "</small></div></div></td>" +
            "<td>" + esc(p.category || "Uncategorised") + '</td><td class="mono">' + num(p.units) + '</td><td class="mono">' + money(p.revenue) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    return '<section class="dash-card"><div class="dash-card-head"><div><h3>Top Selling Products</h3><p>Best performing products.</p></div>' +
      '<a class="link-btn" href="#/products">View All</a></div>' + body + "</section>";
  }

  function lowStockCard(stats) {
    var products = stats.lowStockProducts || [];
    var body = "";
    if (!products.length) {
      body = '<div class="dash-empty"><strong>All products are well stocked</strong>No products are below the inventory threshold.</div>';
    } else {
      body = '<div class="dash-table"><table><thead><tr><th>Product</th><th>Stock</th><th>Status</th></tr></thead><tbody>' +
        products.map(function (p) {
          var out = p.stock <= 0;
          return '<tr><td><div class="product-cell"><img src="' + esc(p.image || "/img/placeholder.svg") + '" alt="">' +
            "<div><strong>" + esc(p.title) + "</strong><small>" + esc(p.category || "Uncategorised") + "</small></div></div></td>" +
            '<td class="mono stock-qty ' + (out ? "out" : "low") + '">' + num(p.stock) + "</td>" +
            '<td><span class="stock-badge ' + (out ? "out" : "low") + '">' + (out ? "Out of Stock" : "Low Stock") + "</span></td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    return '<section class="dash-card"><div class="dash-card-head"><div><h3>Low Stock Products</h3><p>Products running out of stock.</p></div>' +
      '<a class="link-btn" href="#/products">View All</a></div>' + body + "</section>";
  }

  function updateNotificationBadge(stats) {
    var count = Number(stats.pendingOrders || 0) + Number(stats.pendingReviews || 0) + Number(stats.lowStock || 0) + Number(stats.outOfStock || 0);
    var badge = $("#notif-count");
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    var btn = $("#notif-btn");
    if (btn) btn.setAttribute("aria-label", count ? count + " items need attention" : "Notifications");
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------
  async function viewProducts() {
    var query = state.cache.productQuery || { q: "", status: "" };
    var params = new URLSearchParams({ limit: "200" });
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    var data = await api("/api/admin/products?" + params.toString());
    state.products = data.products || [];

    var actions = '<button class="btn" type="button" data-action="bulk-products">Bulk upload</button>' +
      '<button class="btn primary" type="button" data-action="new-product">+ Add product</button>';
    var html = pageHead("Product catalog", state.products.length + " products loaded", actions);

    html += '<div class="card"><form class="toolbar" data-form="product-search">' +
      '<div class="search">' + icon("search") + '<input type="search" name="q" placeholder="Search title, SKU\u2026" value="' + esc(query.q) + '"></div>' +
      '<select name="status" style="max-width:170px"><option value="">All statuses</option>' +
      '<option value="active"' + (query.status === "active" ? " selected" : "") + ">Active</option>" +
      '<option value="inactive"' + (query.status === "inactive" ? " selected" : "") + ">Inactive</option></select>" +
      '<button class="btn small" type="submit">Filter</button>' +
      '<span class="muted" style="margin-left:auto">' + num(data.total) + " total</span></form>";

    if (!state.products.length) {
      html += emptyState("No products found", "Try a different search, or add your first product.");
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      state.products.forEach(function (p) {
        var stockBadge = p.stock <= 0 ? '<span class="badge red">Out</span>' : p.stock <= 5 ? '<span class="badge amber">' + p.stock + "</span>" : p.stock;
        html += "<tr>" +
          '<td><div class="cell-product"><img class="thumb" src="' + esc(p.image || "/img/placeholder.svg") + '" alt=""><div><strong>' + esc(p.title) +
          "</strong><small>" + esc(p.sku || "") + "</small></div></div></td>" +
          "<td>" + esc(p.categoryName || p.category || "\u2014") + (p.subcategoryName ? '<br><small class="muted">' + esc(p.subcategoryName) + "</small>" : "") + "</td>" +
          '<td class="mono">' + money(p.price) + (p.mrp > p.price ? ' <s class="muted">' + money(p.mrp) + "</s>" : "") + "</td>" +
          "<td>" + stockBadge + "</td>" +
          "<td>" + statusBadge(p.status) + (p.featured ? ' <span class="badge blue">Featured</span>' : "") + "</td>" +
          '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-product" data-id="' + esc(p.id) + '">Edit</button>' +
          '<button class="link-btn" type="button" data-action="toggle-product" data-id="' + esc(p.id) + '">' + (p.status === "active" ? "Deactivate" : "Activate") + "</button>" +
          '<button class="link-btn danger" type="button" data-action="delete-product" data-id="' + esc(p.id) + '">Delete</button></div></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  async function openProductForm(id) {
    var product = null;
    if (id) product = await api("/api/admin/products/" + encodeURIComponent(id));
    var categories = await catalogCategories();
    var brands = await catalogBrands();
    var filterData = await api("/api/admin/filters");
    var filterValues = filterData.values || [];
    openModal(modalHead(id ? "Edit product" : "Add product", id ? "Update catalog details" : "Create a new catalog item") +
      '<div class="modal-body">' + productFormHtml(product, categories, brands, filterValues) + "</div>", true);
    var form = $('[data-form="product"]');
    if (form) filterSubcats(form);
  }

  function catalogCategories() {
    if (state.cache.categories) return Promise.resolve(state.cache.categories);
    return api("/api/categories").then(function (d) {
      state.cache.categories = d.categories || [];
      return state.cache.categories;
    });
  }

  function catalogBrands() {
    if (state.cache.brands) return Promise.resolve(state.cache.brands);
    return api("/api/brands").then(function (d) {
      state.cache.brands = d.brands || [];
      return state.cache.brands;
    });
  }

  function productFormHtml(p, categories, brands, filterValues) {
    var product = p || {};
    var catOptions = '<option value="">\u2014 Select category \u2014</option>';
    var subOptions = '<option value="">\u2014 None \u2014</option>';
    (categories || []).forEach(function (c) {
      catOptions += '<option value="' + esc(c.id) + '"' + (product.categoryId === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>";
      (c.subs || []).forEach(function (s) {
        subOptions += '<option value="' + esc(s.id) + '" data-parent="' + esc(c.id) + '"' + (product.subcategoryId === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>";
      });
    });
    var brandOptions = '<option value="">\u2014 No brand \u2014</option>';
    (brands || []).forEach(function (b) {
      brandOptions += '<option value="' + esc(b.id) + '"' + (product.brandId === b.id ? " selected" : "") + ">" + esc(b.name) + "</option>";
    });

    var imageRows = (product.images && product.images.length ? product.images : [""]).map(imageRow).join("");
    var variantRows = (product.variants || []).map(variantRow).join("");
    var specs = product.specs || {};
    var specRows = Object.keys(specs).map(function (k) { return specRow(k, specs[k]); }).join("");
    var selectedFilters = product.filterValues || [];
    var filterRows = FILTER_VALUE_KINDS.map(function (kind) {
      var options = (filterValues || []).filter(function (value) { return value.kind === kind.key && Number(value.active) !== 0; });
      if (!options.length) return "";
      return '<label class="field full"><span>' + esc(kind.label) + "</span>" +
        '<select multiple size="' + Math.min(5, Math.max(2, options.length)) + '" data-role="filter-values" data-kind="' + esc(kind.key) + '">' +
        options.map(function (value) {
          return '<option value="' + esc(value.id) + '"' + (selectedFilters.indexOf(value.id) >= 0 ? " selected" : "") + ">" +
            esc(value.name) + (value.category_id ? " (scoped)" : "") + "</option>";
        }).join("") + "</select></label>";
    }).join("");

    return '<form data-form="product" data-id="' + esc(product.id || "") + '" novalidate>' +
      '<div class="form-grid">' +
      field("Title *", '<input name="title" value="' + esc(product.title || "") + '" required maxlength="200" placeholder="Product name">', true) +
      '<label class="field full"><span>Description</span><textarea name="description" rows="3" maxlength="5000" placeholder="Short product description">' + esc(product.description || "") + "</textarea></label>" +
      field("Category", '<select name="categoryId" data-role="parent-cat">' + catOptions + "</select>") +
      field("Subcategory", '<select name="subcategoryId" data-role="sub-cat">' + subOptions + "</select>") +
      field("Brand", '<select name="brandId">' + brandOptions + "</select>") +
      field("SKU", '<input name="sku" value="' + esc(product.sku || "") + '" maxlength="60" placeholder="Auto-generated if empty">') +
      field("Selling price (\u20B9) *", '<input name="price" type="number" min="0" step="0.01" value="' + esc(product.price != null ? product.price : "") + '" required>') +
      field("MRP (\u20B9)", '<input name="mrp" type="number" min="0" step="0.01" value="' + esc(product.mrp != null ? product.mrp : "") + '">') +
      field("Stock quantity", '<input name="stock" type="number" min="0" step="1" value="' + esc(product.stock != null ? product.stock : 0) + '">') +
      field("Status", '<select name="status"><option value="active"' + (product.status !== "inactive" ? " selected" : "") + '>Active</option><option value="inactive"' + (product.status === "inactive" ? " selected" : "") + ">Inactive</option></select>") +
      '<label class="check-row"><input type="checkbox" name="featured"' + (product.featured ? " checked" : "") + "> Featured on homepage</label>" +
      '<label class="check-row"><input type="checkbox" name="newArrival"' + (product.newArrival ? " checked" : "") + "> New arrival</label>" +
      "</div>" +

      '<div class="section-title">Images</div>' +
      '<div class="image-drop-area" data-dropzone="product-images">' +
      '<div class="image-list" data-role="images">' + imageRows + "</div>" +
      '<label class="upload-box upload-dropzone">' +
      '<span class="dropzone-title">Drag &amp; drop images here</span>' +
      '<span class="dropzone-sub">or click to browse \u00B7 PNG, JPG, GIF or WEBP \u00B7 max 4 MB each</span>' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-action="upload-images"></label>' +
      "</div>" +

      '<div class="section-title">Variants</div>' +
      '<div class="rows" data-role="variants">' + variantRows + "</div>" +
      '<div style="margin-top:8px"><button class="btn small" type="button" data-action="add-variant">+ Add variant</button></div>' +

      '<div class="section-title">Specifications</div>' +
      '<div class="rows" data-role="specs">' + specRows + "</div>" +
      '<div style="margin-top:8px"><button class="btn small" type="button" data-action="add-spec">+ Add specification</button></div>' +
      '<p class="help">Age group filters are created automatically from specifications named Age, Age group or Recommended age. Colour and size filters follow variants.</p>' +

      '<div class="section-title">Filter tags</div>' +
      (filterRows
        ? '<div class="form-grid">' + filterRows + "</div>" +
          '<p class="help">Hold Ctrl (Windows) or Cmd (Mac) to select multiple values. Manage these options under Filters.</p>'
        : '<p class="help">No filter values yet. Add them under Store setup \u203A Filters.</p>') +

      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (product.id ? "Save changes" : "Create product") + "</button></div>" +
      "</form>";
  }

  function field(label, inputHtml, full) {
    return '<label class="field' + (full ? " full" : "") + '"><span>' + esc(label) + "</span>" + inputHtml + "</label>";
  }

  function imageRow(url) {
    var src = url || "/img/placeholder.svg";
    return '<div class="image-line"><img class="image-preview" src="' + esc(src) + '" alt="">' +
      '<input data-role="image-url" value="' + esc(url || "") + '" placeholder="/uploads/... or /img/...">' +
      '<button type="button" class="remove-row" data-action="remove-image" aria-label="Remove image">&times;</button></div>';
  }

  function variantRow(v) {
    var value = v || {};
    return '<div class="row-line">' +
      '<input data-role="v-type" placeholder="Type (e.g. Size)" value="' + esc(value.type || "") + '">' +
      '<input data-role="v-value" placeholder="Value (e.g. M)" value="' + esc(value.value || "") + '">' +
      '<input data-role="v-price" type="number" min="0" step="0.01" placeholder="Price" value="' + esc(value.price != null ? value.price : "") + '">' +
      '<input data-role="v-stock" type="number" min="0" step="1" placeholder="Stock" value="' + esc(value.stock != null ? value.stock : "") + '">' +
      '<button type="button" class="remove-row" data-action="remove-row" aria-label="Remove">&times;</button></div>';
  }

  function specRow(key, value) {
    return '<div class="row-line spec">' +
      '<input data-role="s-key" placeholder="Key" value="' + esc(key || "") + '">' +
      '<input data-role="s-value" placeholder="Value" value="' + esc(value || "") + '">' +
      '<button type="button" class="remove-row" data-action="remove-row" aria-label="Remove">&times;</button></div>';
  }

  function filterSubcats(form) {
    var parent = form.querySelector('[data-role="parent-cat"]');
    var sub = form.querySelector('[data-role="sub-cat"]');
    if (!parent || !sub) return;
    var parentId = parent.value;
    Array.prototype.forEach.call(sub.options, function (opt) {
      if (!opt.value) return;
      var match = opt.getAttribute("data-parent") === parentId;
      opt.hidden = !match;
      opt.disabled = !match;
    });
    var selected = sub.options[sub.selectedIndex];
    if (selected && selected.disabled) sub.value = "";
  }

  async function saveProduct(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var images = $$('[data-role="image-url"]', form).map(function (i) { return i.value.trim(); }).filter(Boolean);
    var variants = $$('[data-role="variants"] .row-line', form).map(function (row) {
      var price = row.querySelector('[data-role="v-price"]').value;
      var stock = row.querySelector('[data-role="v-stock"]').value;
      return {
        type: row.querySelector('[data-role="v-type"]').value.trim(),
        value: row.querySelector('[data-role="v-value"]').value.trim(),
        price: price === "" ? null : Number(price),
        stock: stock === "" ? null : Number(stock),
      };
    }).filter(function (v) { return v.value; });
    var specs = {};
    $$('[data-role="specs"] .row-line', form).forEach(function (row) {
      var key = row.querySelector('[data-role="s-key"]').value.trim();
      var val = row.querySelector('[data-role="s-value"]').value.trim();
      if (key) specs[key] = val;
    });

    var title = String(fd.get("title") || "").trim();
    var price = fd.get("price");
    if (title.length < 3) return showFormError(form, "Product title must be at least 3 characters.");
    if (price === "" || Number(price) < 0) return showFormError(form, "Enter a valid selling price.");
    var filterValues = $$('[data-role="filter-values"]', form).reduce(function (ids, select) {
      return ids.concat(Array.prototype.map.call(select.selectedOptions, function (option) { return option.value; }));
    }, []);

    var body = {
      title: title,
      description: String(fd.get("description") || ""),
      categoryId: fd.get("categoryId") || null,
      subcategoryId: fd.get("subcategoryId") || null,
      brandId: fd.get("brandId") || null,
      sku: String(fd.get("sku") || ""),
      price: Number(price),
      mrp: fd.get("mrp") === "" ? 0 : Number(fd.get("mrp")),
      stock: fd.get("stock") === "" ? 0 : Number(fd.get("stock")),
      status: fd.get("status") === "inactive" ? "inactive" : "active",
      featured: form.querySelector('[name="featured"]').checked,
      newArrival: form.querySelector('[name="newArrival"]').checked,
      filterValues: filterValues,
      images: images,
      variants: variants,
      specs: specs,
    };

    var id = form.getAttribute("data-id");
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/products/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/products", { method: "POST", body: body });
      toast(id ? "Product updated." : "Product created.", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  function openBulkForm() {
    openModal(modalHead("Bulk upload products", "Paste a JSON array. Maximum 500 products.") +
      '<div class="modal-body"><form data-form="bulk">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<label class="field"><span>Products JSON</span><textarea name="json" rows="12" spellcheck="false" placeholder=\'[{"title":"Product","price":499,"mrp":999,"stock":10,"category":"Electronics","brand":"Aamart","images":["/img/placeholder.svg"]}]\'></textarea>' +
      '<span class="help">Each item supports title, price, mrp, stock, sku, description, category, subcategory, brand, status, featured, images, variants and specs.</span></label>' +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">Upload products</button></div></form></div>', true);
  }

  async function submitBulk(form, button) {
    clearFormError(form);
    var text = String(new FormData(form).get("json") || "").trim();
    var list;
    try { list = JSON.parse(text); } catch (e) { return showFormError(form, "Invalid JSON. Please check the format."); }
    if (!Array.isArray(list) || !list.length) return showFormError(form, "Provide a non-empty JSON array of products.");
    if (list.length > 500) return showFormError(form, "Maximum 500 products per upload.");
    btnLabel(button, "Uploading\u2026");
    try {
      var res = await api("/api/admin/products-bulk", { body: { products: list } });
      var msg = "Created " + res.created + " product" + (res.created === 1 ? "" : "s") + ".";
      if (res.errors && res.errors.length) msg += " " + res.errors.length + " failed.";
      toast(msg, res.created ? "success" : "error");
      if (res.errors && res.errors.length) {
        showFormError(form, res.errors.slice(0, 5).map(function (e) { return "Row " + e.row + ": " + e.error; }).join(" \u00B7 "));
        btnReset(button);
        if (res.created) route();
        return;
      }
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------
  async function viewOrders() {
    var query = state.cache.orderQuery || { q: "", status: "" };
    var params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    var data = await api("/api/admin/orders" + (params.toString() ? "?" + params.toString() : ""));
    state.orders = data.orders || [];

    var html = pageHead("Orders", state.orders.length + " orders loaded", "");
    html += '<div class="card"><form class="toolbar" data-form="order-search">' +
      '<div class="search">' + icon("search") + '<input type="search" name="q" placeholder="Search order no, customer, phone\u2026" value="' + esc(query.q) + '"></div>' +
      '<select name="status" style="max-width:180px"><option value="">All statuses</option>' +
      STATUS_FLOW.concat(["Cancelled"]).map(function (s) {
        return '<option value="' + esc(s) + '"' + (query.status === s ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") +
      "</select>" +
      '<button class="btn small" type="submit">Filter</button></form>';

    if (!state.orders.length) {
      html += emptyState("No orders found", "Orders will appear here as customers check out.");
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th></th></tr></thead><tbody>';
      state.orders.forEach(function (o) {
        var count = (o.items || []).reduce(function (sum, i) { return sum + i.qty; }, 0);
        html += "<tr>" +
          "<td><strong>" + esc(o.orderNo) + "</strong></td>" +
          "<td>" + esc(o.customer && o.customer.name) + '<br><small class="muted">' + esc(o.customer && o.customer.phone) + "</small></td>" +
          '<td class="mono">' + count + "</td>" +
          '<td class="mono">' + money(o.payable) + "</td>" +
          "<td>" + esc(o.payment && o.payment.method) + "<br>" + statusBadge(o.payment && o.payment.status) + "</td>" +
          "<td>" + statusBadge(o.status) + "</td>" +
          '<td class="nowrap muted">' + dateOnly(o.createdAt) + "</td>" +
          '<td><button class="link-btn" type="button" data-action="view-order" data-id="' + esc(o.id) + '">View</button></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  function openOrderModal(id) {
    var order = state.orders.filter(function (o) { return o.id === id; })[0];
    if (!order) return;
    var addr = order.address || {};
    var closed = order.status === "Delivered" || order.status === "Cancelled";
    var statusForm = closed
      ? '<p class="muted" style="margin-top:14px">This order is ' + esc(order.status.toLowerCase()) + " and can no longer be updated.</p>"
      : '<form data-form="order-status" data-id="' + esc(order.id) + '" style="margin-top:16px">' +
        '<div class="section-title">Update status</div>' +
        '<div class="form-grid">' +
        field("New status", '<select name="status">' + STATUS_FLOW.concat(["Cancelled"]).map(function (s) {
          return '<option value="' + esc(s) + '"' + (s === order.status ? " selected" : "") + ">" + esc(s) + "</option>";
        }).join("") + "</select>") +
        field("Note (optional)", '<input name="note" maxlength="200" placeholder="Visible in order timeline">') +
        "</div>" +
        '<div class="form-error" data-role="form-error" hidden></div>' +
        '<div class="form-actions"><button class="btn primary" type="submit">Update order</button></div></form>';

    var items = (order.items || []).map(function (i) {
      return '<div class="order-item"><img class="thumb" src="' + esc(i.image || "/img/placeholder.svg") + '" alt="">' +
        '<div class="oi-name">' + esc(i.name) + (i.variant ? "<small>Variant: " + esc(i.variant) + "</small>" : "") + "</div>" +
        '<div class="mono">' + money(i.price) + " \u00D7 " + i.qty + "</div></div>";
    }).join("");

    var history = (order.history || []).map(function (h) {
      return '<div class="tl"><span class="tl-dot"></span><div class="tl-body"><strong>' + esc(h.status) + "</strong>" +
        (h.note ? " \u2014 " + esc(h.note) : "") + "<span>" + dt(h.at) + (h.by ? " \u00B7 " + esc(h.by) : "") + "</span></div></div>";
    }).join("");

    var html = modalHead("Order " + order.orderNo, dt(order.createdAt)) +
      '<div class="modal-body">' +
      '<div class="order-meta">' +
      metaBox("Customer", esc(order.customer && order.customer.name) + "<br>" + esc(order.customer && order.customer.phone) + (order.customer && order.customer.email ? "<br>" + esc(order.customer.email) : "")) +
      metaBox("Shipping address", esc(addr.name) + "<br>" + esc(addr.line1) + (addr.line2 ? ", " + esc(addr.line2) : "") + "<br>" + esc(addr.city) + ", " + esc(addr.state) + " \u2013 " + esc(addr.pincode)) +
      metaBox("Payment", esc(order.payment && order.payment.method) + " \u00B7 " + statusBadge(order.payment && order.payment.status)) +
      metaBox("Status", statusBadge(order.status) + (order.couponCode ? '<div class="muted" style="margin-top:5px">Coupon: ' + esc(order.couponCode) + "</div>" : "")) +
      "</div>" +
      '<div class="section-title">Items</div><div class="order-items">' + items + "</div>" +
      '<div class="order-meta">' +
      metaBox("Item total", money(order.itemTotal)) +
      metaBox("Discount", money(order.discount)) +
      metaBox("Delivery", money(order.deliveryCharge)) +
      metaBox("Tax", money(order.tax)) +
      metaBox("Amount payable", "<strong>" + money(order.payable) + "</strong>") +
      "</div>" +
      '<div class="section-title">Timeline</div><div class="timeline">' + (history || '<p class="muted">No history yet.</p>') + "</div>" +
      statusForm +
      "</div>";
    openModal(html, true);
  }

  function metaBox(label, valueHtml) {
    return '<div class="meta-box"><div class="k">' + esc(label) + '</div><div class="v">' + valueHtml + "</div></div>";
  }

  // ---------------------------------------------------------------------------
  // Reviews
  // ---------------------------------------------------------------------------
  async function viewReviews() {
    var data = await api("/api/admin/reviews");
    var reviews = data.reviews || [];
    var html = pageHead("Customer reviews", reviews.length + " reviews loaded", "");
    html += '<div class="card">';
    if (!reviews.length) {
      html += emptyState("No reviews yet", "Approved and pending reviews will appear here.");
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Reviewer</th><th>Rating</th><th>Review</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
      reviews.forEach(function (r) {
        var stars = "\u2605".repeat(Math.max(0, Math.min(5, r.rating || 0))) + "\u2606".repeat(5 - Math.max(0, Math.min(5, r.rating || 0)));
        html += "<tr>" +
          "<td><strong>" + esc(r.productTitle || "\u2014") + "</strong></td>" +
          "<td>" + esc(r.name) + "</td>" +
          '<td class="nowrap" style="color:var(--amber)">' + stars + "</td>" +
          '<td style="max-width:280px"><strong>' + esc(r.title || "") + '</strong><br><span class="muted">' + esc(r.body || "") + "</span></td>" +
          "<td>" + statusBadge(r.status) + "</td>" +
          '<td class="nowrap muted">' + dateOnly(r.created_at) + "</td>" +
          '<td><div class="actions">' +
          (r.status !== "approved" ? '<button class="link-btn" type="button" data-action="approve-review" data-id="' + esc(r.id) + '">Approve</button>' : "") +
          (r.status !== "rejected" ? '<button class="link-btn" type="button" data-action="reject-review" data-id="' + esc(r.id) + '">Reject</button>' : "") +
          '<button class="link-btn danger" type="button" data-action="delete-review" data-id="' + esc(r.id) + '">Delete</button>' +
          "</div></td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------
  async function viewCategories() {
    var data = await api("/api/admin/categories");
    state.cache.adminCategories = data.flat || [];
    var rows = state.cache.adminCategories;
    var byId = {};
    rows.forEach(function (c) { byId[c.id] = c; });

    var html = pageHead("Categories", rows.length + " categories", '<button class="btn primary" type="button" data-action="new-category">+ Add category</button>');
    html += '<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Parent</th><th>Image</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    rows.forEach(function (c) {
      var parent = c.parent_id && byId[c.parent_id] ? byId[c.parent_id].name : "\u2014";
      html += "<tr>" +
        "<td><strong>" + esc(c.name) + "</strong><br><small class=\"muted\">" + esc(c.slug) + "</small></td>" +
        "<td>" + esc(parent) + "</td>" +
        '<td>' + (c.image ? '<img class="category-thumb" src="' + esc(c.image) + '" alt="' + esc(c.name) + '" loading="lazy">' : '<span class="muted">\u2014</span>') + "</td>" +
        '<td class="mono">' + esc(c.sort) + "</td>" +
        "<td>" + statusBadge(c.active ? "Active" : "Inactive") + "</td>" +
        '<td><div class="actions">' +
        '<button class="link-btn" type="button" data-action="edit-category" data-id="' + esc(c.id) + '">Edit</button>' +
        (!c.parent_id ? '<button class="link-btn" type="button" data-action="new-category" data-parent="' + esc(c.id) + '">Add sub</button>' : "") +
        '<button class="link-btn danger" type="button" data-action="delete-category" data-id="' + esc(c.id) + '">Delete</button>' +
        "</div></td></tr>";
    });
    html += "</tbody></table></div></div>";
    $("#view").innerHTML = html;
  }

  async function openCategoryForm(id, presetParentId) {
    var data = await api("/api/admin/categories");
    var flat = data.flat || [];
    var cat = id ? flat.filter(function (c) { return c.id === id; })[0] : null;
    var parentOptions = '<option value="">\u2014 Top level \u2014</option>';
    flat.forEach(function (c) {
      if (c.parent_id) return;
      if (cat && c.id === cat.id) return;
      parentOptions += '<option value="' + esc(c.id) + '"' + ((cat && cat.parent_id === c.id) || (!cat && presetParentId === c.id) ? " selected" : "") + ">" + esc(c.name) + "</option>";
    });
    var activeRow = cat
      ? '<label class="check-row"><input type="checkbox" name="active"' + (cat.active ? " checked" : "") + "> Active</label>"
      : "";
    var imageSrc = cat && cat.image ? esc(cat.image) : "";
    var html = modalHead(cat ? "Edit category" : "Add category", cat ? cat.slug : "Create a category or subcategory") +
      '<div class="modal-body"><form data-form="category" data-id="' + esc(cat ? cat.id : "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Name *", '<input name="name" value="' + esc(cat ? cat.name : "") + '" required maxlength="80">', true) +
      (cat ? "" : field("Parent", '<select name="parentId">' + parentOptions + "</select>")) +
      field("Image URL", '<input name="image" value="' + imageSrc + '" maxlength="500" placeholder="/uploads/... or https://...">', true) +
      '<div class="full upload-box">Upload category image (JPG, PNG, WEBP or GIF \u00B7 max 4 MB)' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-action="upload-category-image"></div>' +
      '<div class="full category-image-preview-wrap"><img class="category-image-preview" data-role="category-preview"' + (imageSrc ? ' src="' + imageSrc + '"' : "") + ' alt="Category image preview"' + (imageSrc ? "" : " hidden") + '>' +
      '<button class="btn small ghost" type="button" data-action="remove-category-image"' + (imageSrc ? "" : " hidden") + ">Remove image</button></div>" +
      field("Sort order", '<input name="sort" type="number" step="1" value="' + esc(cat ? cat.sort : 0) + '">') +
      (activeRow ? '<div class="full">' + activeRow + "</div>" : "") +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (cat ? "Save changes" : "Create category") + "</button></div>" +
      "</form></div>";
    openModal(html);
    var form = $("#modal-root form[data-form=\"category\"]");
    if (form) {
      var imageInput = form.querySelector('[name="image"]');
      if (imageInput) imageInput.addEventListener("input", function () { syncCategoryPreview(form); });
      syncCategoryPreview(form);
    }
  }

  function syncCategoryPreview(form) {
    var input = form.querySelector('[name="image"]');
    var preview = form.querySelector('[data-role="category-preview"]');
    var removeBtn = form.querySelector('[data-action="remove-category-image"]');
    if (!input || !preview) return;
    var url = input.value.trim();
    if (url) {
      preview.src = url;
      preview.hidden = false;
      if (removeBtn) removeBtn.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
      if (removeBtn) removeBtn.hidden = true;
    }
  }

  async function saveCategory(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    if (!name) return showFormError(form, "Category name is required.");
    var id = form.getAttribute("data-id");
    var body = { name: name, image: String(fd.get("image") || ""), sort: Number(fd.get("sort") || 0) };
    if (id) {
      body.active = form.querySelector('[name="active"]') ? form.querySelector('[name="active"]').checked : true;
    } else {
      body.parentId = fd.get("parentId") || null;
    }
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/categories/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/categories", { method: "POST", body: body });
      toast(id ? "Category updated." : "Category created.", "success");
      state.cache.categories = null;
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Brands
  // ---------------------------------------------------------------------------
  async function viewBrands() {
    var data = await api("/api/admin/brands");
    var brands = data.brands || [];
    var html = pageHead("Brands", brands.length + " brands", '<button class="btn primary" type="button" data-action="new-brand">+ Add brand</button>');
    html += '<div class="card">';
    if (!brands.length) html += emptyState("No brands yet", "Add a brand to tag your products.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Brand</th><th>Slug</th><th>Popular</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      brands.forEach(function (b) {
        var logo = b.logo ? '<img class="thumb" src="' + esc(b.logo) + '" alt="">' : '<span class="brand-dot">' + esc(String(b.name || "?").slice(0, 1)) + "</span>";
        html += "<tr><td><div class=\"cell-product\">" + logo + "<div><strong>" + esc(b.name) + "</strong></div></div></td>" +
          "<td class=\"muted\">" + esc(b.slug) + "</td><td>" + (b.popular ? '<span class="badge blue">Popular</span>' : '<span class="muted">\u2014</span>') + "</td>" +
          "<td>" + esc(b.sort) + "</td><td>" + statusBadge(b.active ? "Active" : "Inactive") + "</td>" +
          '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-brand" data-id="' + esc(b.id) + '">Edit</button>' +
          '<button class="link-btn danger" type="button" data-action="delete-brand" data-id="' + esc(b.id) + '">Delete</button></div></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  function openBrandForm(brand) {
    var b = brand || {};
    openModal(modalHead(b.id ? "Edit brand" : "Add brand", "Brands power the rich brand filter on the storefront") +
      '<div class="modal-body"><form data-form="brand" data-id="' + esc(b.id || "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Brand name *", '<input name="name" required maxlength="80" value="' + esc(b.name || "") + '" placeholder="e.g. Aamart Essentials">', true) +
      field("Logo URL", '<input name="logo" maxlength="500" value="' + esc(b.logo || "") + '" placeholder="/uploads/logo.png or https://...">', true) +
      '<div class="upload-box">Upload brand logo (PNG, JPG, GIF or WEBP \u00B7 max 4 MB)<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-action="upload-brand-logo"></div>' +
      field("Sort order", '<input name="sort" type="number" step="1" value="' + esc(b.sort != null ? b.sort : 0) + '">') +
      '<label class="check-row"><input type="checkbox" name="popular"' + (b.popular ? " checked" : "") + "> Show as popular brand</label>" +
      '<label class="check-row"><input type="checkbox" name="active"' + (b.id ? (b.active ? " checked" : "") : " checked") + "> Active</label>" +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (b.id ? "Save changes" : "Create brand") + "</button></div></form></div>");
  }

  async function saveBrand(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    if (!name) return showFormError(form, "Brand name is required.");
    var body = {
      name: name,
      logo: String(fd.get("logo") || "").trim(),
      popular: form.querySelector('[name="popular"]').checked,
      sort: Number(fd.get("sort") || 0),
      active: form.querySelector('[name="active"]').checked,
    };
    var id = form.getAttribute("data-id");
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/brands/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/brands", { body: body });
      toast(id ? "Brand updated." : "Brand created.", "success");
      state.cache.brands = null;
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------
  async function viewFilters() {
    var data = await api("/api/admin/filters");
    var groups = data.groups || [];
    var values = data.values || [];
    var categories = data.categories || [];
    var groupByKey = {};
    groups.forEach(function (g) { groupByKey[g.key] = g; });
    var categoryById = {};
    categories.forEach(function (c) { categoryById[c.id] = c.name; });

    var actions = '<button class="btn primary" type="button" data-action="new-filter-value">+ Add filter value</button>';
    var html = pageHead("Filter system", groups.length + " groups \u00B7 " + values.length + " values", actions);

    html += '<div class="card card-pad"><div class="card-head"><h3>Filter groups</h3><span class="muted small">Toggle, rename and order storefront filters</span></div>' +
      '<form data-form="filter-groups"><div class="table-wrap"><table class="data"><thead><tr><th>Group</th><th>Label</th><th>Enabled</th><th>Sort</th></tr></thead><tbody>' +
      groups.map(function (g) {
        return '<tr data-role="filter-group-row" data-key="' + esc(g.key) + '"><td><strong>' + esc(g.key) + '</strong><br><small class="muted">' + esc(g.type) + "</small></td>" +
          '<td><input class="input" data-role="group-label" maxlength="60" value="' + esc(g.label) + '"></td>' +
          '<td><label class="check-row"><input type="checkbox" data-role="group-enabled"' + (g.enabled ? " checked" : "") + "> On</label></td>" +
          '<td><input class="input" data-role="group-sort" type="number" step="1" style="max-width:100px" value="' + esc(g.sort) + '"></td></tr>';
      }).join("") + '</tbody></table></div><div class="form-actions"><button class="btn primary" type="submit">Save groups</button></div></form></div>';

    html += '<div class="card"><div class="card-head"><h3>Filter values</h3><span class="muted small">Only active values appear on the storefront</span></div>';
    if (!values.length) {
      html += emptyState("No filter values yet", "Add values like Men, Blue, M or India.");
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Value</th><th>Group</th><th>Scope</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      values.forEach(function (v) {
        var meta = {};
        try { meta = JSON.parse(v.meta || "{}"); } catch (e) { meta = {}; }
        var swatch = v.kind === "color" && meta.hex ? '<span class="filter-swatch" style="background:' + esc(meta.hex) + '"></span>' : "";
        var kindLabel = groupByKey[v.kind] ? groupByKey[v.kind].label : v.kind;
        html += "<tr><td>" + swatch + "<strong>" + esc(v.name) + '</strong><br><small class="muted">' + esc(v.value) + "</small></td>" +
          "<td>" + esc(kindLabel) + "</td><td>" + esc(v.category_id ? (categoryById[v.category_id] || "Category") : "All products") + "</td>" +
          "<td>" + esc(v.sort) + "</td><td>" + statusBadge(v.active ? "Active" : "Inactive") + "</td>" +
          '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-filter-value" data-id="' + esc(v.id) + '">Edit</button>' +
          '<button class="link-btn danger" type="button" data-action="delete-filter-value" data-id="' + esc(v.id) + '">Delete</button></div></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  async function openFilterValueForm(id) {
    var data = await api("/api/admin/filters");
    var value = null;
    if (id) value = (data.values || []).filter(function (v) { return v.id === id; })[0] || null;
    var v = value || {};
    var meta = {};
    try { meta = JSON.parse(v.meta || "{}"); } catch (e) { meta = {}; }
    var kindOptions = FILTER_VALUE_KINDS.map(function (kind) {
      return '<option value="' + esc(kind.key) + '"' + ((v.kind || "gender") === kind.key ? " selected" : "") + ">" + esc(kind.label) + "</option>";
    }).join("");
    var scopeOptions = '<option value="">All products</option>' + (data.categories || []).map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (v.category_id === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>";
    }).join("");
    openModal(modalHead(v.id ? "Edit filter value" : "Add filter value", "Customers will see this in the storefront filter panel") +
      '<div class="modal-body"><form data-form="filter-value" data-id="' + esc(v.id || "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Filter group *", '<select name="kind" required>' + kindOptions + "</select>") +
      field("Scope", '<select name="categoryId">' + scopeOptions + "</select>") +
      field("Display name *", '<input name="name" required maxlength="60" value="' + esc(v.name || "") + '" placeholder="e.g. Navy Blue">', true) +
      field("Internal value *", '<input name="value" required maxlength="60" value="' + esc(v.value || "") + '" placeholder="e.g. Navy Blue">', true) +
      field("Swatch colour", '<input name="color" maxlength="120" value="' + esc(meta.hex || "") + '" placeholder="Hex like #1e3a8a (colour values)">') +
      field("Sort order", '<input name="sort" type="number" step="1" value="' + esc(v.sort != null ? v.sort : 0) + '">') +
      '<label class="check-row"><input type="checkbox" name="active"' + (v.id ? (v.active ? " checked" : "") : " checked") + "> Active</label>" +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (v.id ? "Save changes" : "Create value") + "</button></div></form></div>");
  }

  async function saveFilterValue(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var value = String(fd.get("value") || "").trim();
    if (!name || !value) return showFormError(form, "Display name and internal value are required.");
    var meta = {};
    var color = String(fd.get("color") || "").trim();
    if (color) meta.hex = color;
    var body = {
      kind: fd.get("kind"),
      name: name,
      value: value,
      categoryId: fd.get("categoryId") || "",
      sort: Number(fd.get("sort") || 0),
      active: form.querySelector('[name="active"]').checked,
      meta: meta,
    };
    var id = form.getAttribute("data-id");
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/filters/values/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/filters/values", { body: body });
      toast(id ? "Filter value updated." : "Filter value created.", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  async function saveFilterGroups(form, button) {
    clearFormError(form);
    var groups = $$('[data-role="filter-group-row"]', form).map(function (row) {
      return {
        key: row.getAttribute("data-key"),
        label: row.querySelector('[data-role="group-label"]').value.trim(),
        enabled: row.querySelector('[data-role="group-enabled"]').checked,
        sort: Number(row.querySelector('[data-role="group-sort"]').value || 0),
      };
    });
    btnLabel(button, "Saving\u2026");
    try {
      await api("/api/admin/filters/groups", { method: "PUT", body: { groups: groups } });
      toast("Filter groups saved.", "success");
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  async function deleteFilterValue(id) {
    if (!window.confirm("Delete this filter value? Products using it will lose the tag.")) return;
    try {
      await api("/api/admin/filters/values/" + encodeURIComponent(id), { method: "DELETE" });
      toast("Filter value deleted.", "success");
      route();
    } catch (err) { toast(err.message, "error"); }
  }

  // ---------------------------------------------------------------------------
  // Banners
  // ---------------------------------------------------------------------------
  async function viewBanners() {
    var data = await api("/api/admin/banners");
    var banners = data.banners || [];
    var html = pageHead("Homepage banners", banners.length + " banners", '<button class="btn primary" type="button" data-action="new-banner">+ Add banner</button>');
    html += '<div class="card">';
    if (!banners.length) html += emptyState("No banners yet", "Add a promotional banner for the storefront.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Banner</th><th>Link</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      banners.forEach(function (b) {
        html += "<tr>" +
          '<td><div class="cell-product"><img class="thumb" style="width:76px;height:46px" src="' + esc(b.image || "/img/banner1.svg") + '" alt=""><div><strong>' + esc(b.title) + '</strong><small>' + esc(b.subtitle || "") + "</small></div></div></td>" +
          '<td class="muted">' + esc(b.link || "\u2014") + "</td>" +
          '<td class="mono">' + esc(b.sort) + "</td>" +
          "<td>" + statusBadge(b.active ? "Active" : "Inactive") + "</td>" +
          '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-banner" data-id="' + esc(b.id) + '">Edit</button>' +
          '<button class="link-btn danger" type="button" data-action="delete-banner" data-id="' + esc(b.id) + '">Delete</button></div></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  async function openBannerForm(id) {
    var banner = null;
    if (id) {
      var data = await api("/api/admin/banners");
      banner = (data.banners || []).filter(function (b) { return b.id === id; })[0];
    }
    var b = banner || {};
    openModal(modalHead(banner ? "Edit banner" : "Add banner", "Shown on the storefront home page") +
      '<div class="modal-body"><form data-form="banner" data-id="' + esc(b.id || "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Title *", '<input name="title" value="' + esc(b.title || "") + '" required maxlength="100">', true) +
      field("Subtitle", '<input name="subtitle" value="' + esc(b.subtitle || "") + '" maxlength="160">', true) +
      field("Image URL", '<input name="image" value="' + esc(b.image || "") + '" maxlength="300" placeholder="/img/banner1.svg">', true) +
      '<div class="full upload-box">Upload banner image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-action="upload-banner"></div>' +
      field("Link", '<input name="link" value="' + esc(b.link || "") + '" maxlength="200" placeholder="/#/products">') +
      field("Sort order", '<input name="sort" type="number" step="1" value="' + esc(b.sort != null ? b.sort : 0) + '">') +
      '<label class="check-row full"><input type="checkbox" name="active"' + (b.active === 0 || b.active === "0" ? "" : " checked") + "> Active</label>" +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (banner ? "Save changes" : "Create banner") + "</button></div></form></div>", true);
  }

  async function saveBanner(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var title = String(fd.get("title") || "").trim();
    if (!title) return showFormError(form, "Banner title is required.");
    var body = {
      title: title,
      subtitle: String(fd.get("subtitle") || ""),
      image: String(fd.get("image") || ""),
      link: String(fd.get("link") || ""),
      sort: Number(fd.get("sort") || 0),
      active: form.querySelector('[name="active"]').checked,
    };
    var id = form.getAttribute("data-id");
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/banners/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/banners", { body: body });
      toast(id ? "Banner updated." : "Banner created.", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Coupons
  // ---------------------------------------------------------------------------
  async function viewCoupons() {
    var data = await api("/api/admin/coupons");
    var coupons = data.coupons || [];
    var html = pageHead("Coupons", coupons.length + " discount codes", '<button class="btn primary" type="button" data-action="new-coupon">+ Add coupon</button>');
    html += '<div class="card">';
    if (!coupons.length) html += emptyState("No coupons yet", "Create a discount code to attract customers.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Usage</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      coupons.forEach(function (c) {
        var discount = c.type === "percent" ? c.value + "%" + (c.max_discount ? " (max " + money(c.max_discount) + ")" : "") : money(c.value);
        html += "<tr>" +
          "<td><strong>" + esc(c.code) + "</strong><br><small class=\"muted\">" + esc(c.type) + "</small></td>" +
          '<td class="mono">' + esc(discount) + "</td>" +
          '<td class="mono">' + money(c.min_order) + "</td>" +
          '<td class="mono">' + c.used_count + " / " + (c.usage_limit || "\u221E") + "</td>" +
          '<td class="nowrap muted">' + (c.expires_at ? dateOnly(c.expires_at) : "\u2014") + "</td>" +
          "<td>" + statusBadge(c.active ? "Active" : "Inactive") + "</td>" +
          '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-coupon" data-id="' + esc(c.id) + '">Edit</button>' +
          '<button class="link-btn danger" type="button" data-action="delete-coupon" data-id="' + esc(c.id) + '">Delete</button></div></td></tr>';
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  async function openCouponForm(id) {
    var coupon = null;
    if (id) {
      var data = await api("/api/admin/coupons");
      coupon = (data.coupons || []).filter(function (c) { return c.id === id; })[0];
    }
    var c = coupon || {};
    openModal(modalHead(coupon ? "Edit coupon" : "Add coupon", "Percentage or flat amount discount") +
      '<div class="modal-body"><form data-form="coupon" data-id="' + esc(c.id || "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Code *", '<input name="code" value="' + esc(c.code || "") + '" maxlength="30" style="text-transform:uppercase" ' + (coupon ? "readonly" : "required") + ">") +
      field("Type", '<select name="type"' + (coupon ? " disabled" : "") + '><option value="percent"' + (c.type === "flat" ? "" : " selected") + '>Percentage</option><option value="flat"' + (c.type === "flat" ? " selected" : "") + ">Flat amount</option></select>") +
      field("Value *", '<input name="value" type="number" min="0" step="0.01" value="' + esc(c.value != null ? c.value : "") + '" required>') +
      field("Minimum order (\u20B9)", '<input name="minOrder" type="number" min="0" step="0.01" value="' + esc(c.min_order != null ? c.min_order : 0) + '">') +
      field("Max discount (\u20B9)", '<input name="maxDiscount" type="number" min="0" step="0.01" value="' + esc(c.max_discount != null ? c.max_discount : 0) + '">') +
      field("Usage limit", '<input name="usageLimit" type="number" min="0" step="1" value="' + esc(c.usage_limit != null ? c.usage_limit : 0) + '" placeholder="0 = unlimited">') +
      field("Expires at", '<input name="expiresAt" type="datetime-local" value="' + esc(toLocalInput(c.expires_at)) + '">') +
      (coupon ? '<label class="check-row full"><input type="checkbox" name="active"' + (c.active ? " checked" : "") + "> Active</label>" : "") +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (coupon ? "Save changes" : "Create coupon") + "</button></div></form></div>");
  }

  async function saveCoupon(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var id = form.getAttribute("data-id");
    var value = Number(fd.get("value"));
    if (!(value > 0)) return showFormError(form, "Coupon value must be greater than 0.");
    var body = {
      value: value,
      minOrder: Number(fd.get("minOrder") || 0),
      maxDiscount: Number(fd.get("maxDiscount") || 0),
      usageLimit: Number(fd.get("usageLimit") || 0),
      expiresAt: String(fd.get("expiresAt") || ""),
    };
    if (id) {
      body.active = form.querySelector('[name="active"]').checked;
    } else {
      var code = String(fd.get("code") || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return showFormError(form, "Code must be 3-30 letters, numbers, - or _.");
      body.code = code;
      body.type = fd.get("type") === "flat" ? "flat" : "percent";
    }
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/coupons/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/coupons", { body: body });
      toast(id ? "Coupon updated." : "Coupon created.", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------
  async function viewCustomers() {
    var data = await api("/api/admin/customers");
    var customers = data.customers || [];
    var html = pageHead("Customers", customers.length + " registered users", "");
    html += '<div class="card">';
    if (!customers.length) html += emptyState("No customers yet", "Registered customers will appear here.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Joined</th></tr></thead><tbody>';
      customers.forEach(function (u) {
        html += "<tr><td><strong>" + esc(u.name || "\u2014") + "</strong></td>" +
          "<td>" + esc(u.email) + '<br><small class="muted">' + esc(u.phone || "\u2014") + "</small></td>" +
          '<td class="mono">' + num(u.orders) + "</td>" +
          '<td class="mono">' + money(u.spent) + "</td>" +
          '<td class="nowrap muted">' + dateOnly(u.created_at) + "</td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  async function viewSettings() {
    var data = await api("/api/admin/settings");
    var s = data.settings || {};
    var online = data.onlinePaymentsEnabled === true;
    var html = pageHead("Store settings", "These values control the storefront and checkout");
    html += '<div class="card card-pad"><form data-form="settings">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Site name", '<input name="siteName" value="' + esc(s.siteName || "Aamart") + '" maxlength="80">') +
      field("Tagline", '<input name="tagline" value="' + esc(s.tagline || "") + '" maxlength="160">') +
      field("Currency code", '<input name="currency" value="' + esc(s.currency || "INR") + '" maxlength="8">') +
      field("Tax percent", '<input name="taxPercent" type="number" min="0" step="0.01" value="' + esc(s.taxPercent || 0) + '">') +
      field("Delivery charge (\u20B9)", '<input name="deliveryCharge" type="number" min="0" step="0.01" value="' + esc(s.deliveryCharge || 0) + '">') +
      field("Free delivery above (\u20B9)", '<input name="freeDeliveryAbove" type="number" min="0" step="0.01" value="' + esc(s.freeDeliveryAbove || 0) + '">') +
      field("UPI ID", '<input name="upiId" value="' + esc(s.upiId || "") + '" maxlength="120"' + (online ? "" : " disabled") + ">") +
      field("Support email", '<input name="supportEmail" type="email" value="' + esc(s.supportEmail || "") + '" maxlength="120">') +
      field("Support phone", '<input name="supportPhone" value="' + esc(s.supportPhone || "") + '" maxlength="20">') +
      '<label class="field full"><span>Business address</span><textarea name="address" rows="2" maxlength="300">' + esc(s.address || "") + "</textarea></label>" +
      "</div>" +
      '<div class="section-title">Payment methods</div>' +
      '<p class="muted small" style="margin:0 0 10px">Online payment methods stay hidden and cannot be used at checkout until a payment gateway is configured on the server. Cash on Delivery is the only active method right now.</p>' +
      '<div class="form-grid">' +
      toggle("Cash on Delivery", "codEnabled", s.codEnabled) +
      toggle("UPI", "upiEnabled", s.upiEnabled, !online) +
      toggle("Credit / Debit card", "cardEnabled", s.cardEnabled, !online) +
      toggle("Net banking", "netbankingEnabled", s.netbankingEnabled, !online) +
      toggle("Wallet", "walletEnabled", s.walletEnabled, !online) +
      "</div>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>' +
      "</form></div>";
    $("#view").innerHTML = html;
  }

  function toggle(label, name, value, disabled) {
    var on = value === "1" || value === 1 || value === true;
    return '<label class="check-row"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + (disabled ? " disabled" : "") + "> " + esc(label) + "</label>";
  }

  async function saveSettings(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var textKeys = ["siteName", "tagline", "currency", "deliveryCharge", "freeDeliveryAbove", "taxPercent", "upiId", "supportEmail", "supportPhone", "address"];
    var toggleKeys = ["codEnabled", "upiEnabled", "cardEnabled", "netbankingEnabled", "walletEnabled"];
    var body = {};
    textKeys.forEach(function (key) { body[key] = String(fd.get(key) != null ? fd.get(key) : ""); });
    toggleKeys.forEach(function (key) {
      var input = form.querySelector('[name="' + key + '"]');
      body[key] = input && input.checked ? "1" : "0";
    });
    btnLabel(button, "Saving\u2026");
    try {
      await api("/api/admin/settings", { method: "PUT", body: body });
      toast("Settings saved.", "success");
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------------
  async function viewAdmins() {
    var data = await api("/api/admin/admins");
    var admins = data.admins || [];
    var html = pageHead("Admin accounts", admins.length + " team members", '<button class="btn primary" type="button" data-action="new-admin">+ Add admin</button>');
    html += '<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>';
    admins.forEach(function (a) {
      html += "<tr><td><strong>" + esc(a.name || "\u2014") + "</strong></td>" +
        '<td class="mono">' + esc(a.username) + "</td>" +
        "<td>" + statusBadge(roleLabel(a.role)) + "</td>" +
        "<td>" + statusBadge(a.active ? "Active" : "Inactive") + "</td>" +
        '<td class="nowrap muted">' + dateOnly(a.created_at) + "</td>" +
        '<td><div class="actions"><button class="link-btn" type="button" data-action="edit-admin" data-id="' + esc(a.id) + '">Edit</button>' +
        (a.role !== "super" ? '<button class="link-btn danger" type="button" data-action="delete-admin" data-id="' + esc(a.id) + '">Delete</button>' : "") +
        "</div></td></tr>";
    });
    html += "</tbody></table></div></div>";
    $("#view").innerHTML = html;
  }

  async function openAdminForm(id) {
    var admin = null;
    if (id) {
      var data = await api("/api/admin/admins");
      admin = (data.admins || []).filter(function (a) { return a.id === id; })[0];
    }
    var a = admin || {};
    openModal(modalHead(admin ? "Edit admin" : "Add admin", admin ? a.username : "Create a team account") +
      '<div class="modal-body"><form data-form="admin" data-id="' + esc(a.id || "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      (admin ? "" : field("Username *", '<input name="username" required maxlength="40" autocapitalize="none" spellcheck="false" placeholder="lowercase letters and numbers">')) +
      field("Display name", '<input name="name" value="' + esc(a.name || "") + '" maxlength="80">') +
      field(admin ? "New password" : "Password *", '<input name="password" type="password" minlength="10" ' + (admin ? 'placeholder="Leave blank to keep current"' : "required") + '>') +
      (admin ? "" : field("Role", '<select name="role"><option value="manager">Manager</option><option value="super">Super Admin</option></select>')) +
      (admin ? '<label class="check-row full"><input type="checkbox" name="active"' + (a.active ? " checked" : "") + "> Active</label>" : "") +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (admin ? "Save changes" : "Create admin") + "</button></div></form></div>");
  }

  async function saveAdmin(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var id = form.getAttribute("data-id");
    var password = String(fd.get("password") || "");
    var body = { name: String(fd.get("name") || "") };
    if (password) {
      if (password.length < 10) return showFormError(form, "Password must be at least 10 characters with uppercase, lowercase and a number.");
      body.password = password;
    }
    if (id) {
      body.active = form.querySelector('[name="active"]').checked;
    } else {
      var username = String(fd.get("username") || "").trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return showFormError(form, "Username must be 3-40 lowercase letters, numbers, dot, dash or underscore.");
      if (!password) return showFormError(form, "Password is required for a new admin.");
      body.username = username;
      body.password = password;
      body.role = fd.get("role") === "super" ? "super" : "manager";
    }
    btnLabel(button, "Saving\u2026");
    try {
      if (id) await api("/api/admin/admins/" + encodeURIComponent(id), { method: "PUT", body: body });
      else await api("/api/admin/admins", { body: body });
      toast(id ? "Admin updated." : "Admin created.", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  function openPasswordModal() {
    openModal(modalHead("Change password", "Use at least 10 characters with uppercase, lowercase and a number") +
      '<div class="modal-body"><form data-form="admin-password">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      field("Current password", '<input name="currentPassword" type="password" autocomplete="current-password" required>', true) +
      field("New password", '<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required>', true) +
      field("Confirm new password", '<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required>', true) +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">Update password</button></div></form></div>');
  }

  async function saveAdminPassword(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var next = String(fd.get("newPassword") || "");
    if (next !== String(fd.get("confirmPassword") || "")) return showFormError(form, "New passwords do not match.");
    btnLabel(button, "Updating\u2026");
    try {
      var res = await api("/api/admin/password", {
        body: { currentPassword: fd.get("currentPassword"), newPassword: next },
      });
      if (res.token) {
        state.token = res.token;
        try { localStorage.setItem(TOKEN_KEY, res.token); } catch (e) {}
      }
      toast("Password updated. Other sessions have been signed out.", "success");
      closeModal();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  // ---------------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------------
  async function viewInventory() {
    var data = await api("/api/admin/inventory");
    var rows = data.inventory || [];
    var html = pageHead("Inventory movements", "Latest " + rows.length + " stock changes", "");
    html += '<div class="card">';
    if (!rows.length) html += emptyState("No stock movements yet", "Stock changes are recorded automatically.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Change</th><th>Reason</th><th>By</th><th>When</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var change = Number(r.change);
        html += "<tr><td><strong>" + esc(r.title || r.product_id) + "</strong></td>" +
          '<td class="mono" style="color:' + (change >= 0 ? "var(--green)" : "var(--red)") + '">' + (change >= 0 ? "+" : "") + change + "</td>" +
          "<td>" + esc(r.reason || "\u2014") + "</td>" +
          '<td class="muted">' + esc(r.by || "\u2014") + "</td>" +
          '<td class="nowrap muted">' + dt(r.at) + "</td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  async function viewLogs() {
    var data = await api("/api/admin/logs");
    var logs = data.logs || [];
    var html = pageHead("Activity logs", "Latest " + logs.length + " events", "");
    html += '<div class="card">';
    if (!logs.length) html += emptyState("No activity yet", "Admin and customer actions are recorded here.");
    else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>';
      logs.forEach(function (l) {
        var meta = l.meta || "";
        try {
          var parsed = JSON.parse(meta);
          meta = Object.keys(parsed).map(function (k) { return k + ": " + parsed[k]; }).join(", ");
        } catch (e) {}
        html += "<tr>" +
          '<td class="nowrap muted">' + dt(l.at) + "</td>" +
          "<td>" + esc(l.actor || "\u2014") + "</td>" +
          '<td class="muted">' + esc(l.role || "\u2014") + "</td>" +
          "<td><strong>" + esc(l.action) + "</strong></td>" +
          '<td class="muted" style="max-width:280px">' + esc(meta) + "</td>" +
          '<td class="mono muted">' + esc(l.ip || "\u2014") + "</td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Views map
  // ---------------------------------------------------------------------------
  var VIEWS = {
    dashboard: viewDashboard,
    products: viewProducts,
    orders: viewOrders,
    reviews: viewReviews,
    categories: viewCategories,
    brands: viewBrands,
    filters: viewFilters,
    banners: viewBanners,
    coupons: viewCoupons,
    customers: viewCustomers,
    settings: viewSettings,
    admins: viewAdmins,
    inventory: viewInventory,
    logs: viewLogs,
  };

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------
  document.addEventListener("click", function (event) {
    if (!event.target.closest(".notif-wrap")) closeNotifications();
    if (!event.target.closest(".admin-menu-wrap")) closeAdminMenu();
    if (!event.target.closest(".global-search")) closeSearchResults();

    var el = event.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");

    if (action === "modal-backdrop") {
      if (event.target === el) closeModal();
      return;
    }
    if (action === "close-modal") { closeModal(); return; }
    if (action === "remove-category-image") {
      var catForm = el.closest("form");
      var catImage = catForm && catForm.querySelector('[name="image"]');
      if (catImage) catImage.value = "";
      if (catForm) syncCategoryPreview(catForm);
      return;
    }
    if (action === "change-password") { closeAdminMenu(); openPasswordModal(); return; }
    if (action === "logout") { closeAdminMenu(); logout(); return; }
    if (action === "retry") { route(); return; }
    if (action === "toggle-menu") { toggleSidebar(); return; }
    if (action === "toggle-notifications") { toggleNotifications(); return; }
    if (action === "toggle-admin-menu") { toggleAdminMenu(); return; }
    if (action === "close-notifications") { closeNotifications(); return; }
    if (action === "dashboard-refresh") { route(); return; }
    if (action === "dashboard-range") {
      var nextRange = el.getAttribute("data-range");
      if (["7d", "30d", "12m"].indexOf(nextRange) >= 0) {
        state.dashboardRange = nextRange;
        route();
      }
      return;
    }
    if (action === "dashboard-order") { openOrderById(id); return; }
    if (action === "search-product") {
      closeSearchResults();
      var search = $("#global-search");
      if (search) search.value = "";
      openProductForm(id).catch(function (err) { toast(err.message, "error"); });
      return;
    }
    if (action === "search-order") {
      closeSearchResults();
      var orderSearch = $("#global-search");
      if (orderSearch) orderSearch.value = "";
      openOrderById(id);
      return;
    }

    if (action === "new-product") { openProductForm(null).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-product") { openProductForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "bulk-products") { openBulkForm(); return; }
    if (action === "add-variant") {
      var vBox = $('[data-role="variants"]');
      if (vBox) vBox.insertAdjacentHTML("beforeend", variantRow(null));
      return;
    }
    if (action === "add-spec") {
      var sBox = $('[data-role="specs"]');
      if (sBox) sBox.insertAdjacentHTML("beforeend", specRow("", ""));
      return;
    }
    if (action === "remove-row" || action === "remove-image") {
      var line = el.closest(".row-line, .image-line");
      if (line) line.remove();
      return;
    }

    if (action === "toggle-product") { toggleProduct(id, el); return; }
    if (action === "delete-product") { deleteProduct(id); return; }

    if (action === "new-category") { openCategoryForm(null, el.getAttribute("data-parent")).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-category") { openCategoryForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "delete-category") { deleteRecord("category", id, "category"); return; }

    if (action === "new-brand") { openBrandForm(); return; }
    if (action === "edit-brand") {
      api("/api/admin/brands").then(function (data) {
        var brand = (data.brands || []).filter(function (b) { return b.id === id; })[0];
        if (brand) openBrandForm(brand);
      }).catch(function (e) { toast(e.message, "error"); });
      return;
    }
    if (action === "delete-brand") { deleteRecord("brand", id, "brand"); return; }

    if (action === "new-filter-value") { openFilterValueForm(null).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-filter-value") { openFilterValueForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "delete-filter-value") { deleteFilterValue(id); return; }

    if (action === "new-banner") { openBannerForm(null).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-banner") { openBannerForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "delete-banner") { deleteRecord("banner", id, "banner"); return; }

    if (action === "new-coupon") { openCouponForm(null).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-coupon") { openCouponForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "delete-coupon") { deleteRecord("coupon", id, "coupon"); return; }

    if (action === "view-order") { openOrderModal(id); return; }

    if (action === "approve-review") { moderateReview(id, "approved", el); return; }
    if (action === "reject-review") { moderateReview(id, "rejected", el); return; }
    if (action === "delete-review") { deleteRecord("review", id, "review"); return; }

    if (action === "new-admin") { openAdminForm(null).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "edit-admin") { openAdminForm(id).catch(function (e) { toast(e.message, "error"); }); return; }
    if (action === "delete-admin") { deleteRecord("admin", id, "admin"); return; }
  });

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form.matches("[data-form]")) return;
    event.preventDefault();
    var kind = form.getAttribute("data-form");
    var button = form.querySelector('button[type="submit"]');
    if (!button) button = form.querySelector("button");

    if (kind === "product") { saveProduct(form, button); return; }
    if (kind === "bulk") { submitBulk(form, button); return; }
    if (kind === "product-search") {
      var pfd = new FormData(form);
      state.cache.productQuery = { q: String(pfd.get("q") || "").trim(), status: String(pfd.get("status") || "") };
      route();
      return;
    }
    if (kind === "order-search") {
      var ofd = new FormData(form);
      state.cache.orderQuery = { q: String(ofd.get("q") || "").trim(), status: String(ofd.get("status") || "") };
      route();
      return;
    }
    if (kind === "category") { saveCategory(form, button); return; }
    if (kind === "brand") { saveBrand(form, button); return; }
    if (kind === "filter-value") { saveFilterValue(form, button); return; }
    if (kind === "filter-groups") { saveFilterGroups(form, button); return; }
    if (kind === "banner") { saveBanner(form, button); return; }
    if (kind === "coupon") { saveCoupon(form, button); return; }
    if (kind === "settings") { saveSettings(form, button); return; }
    if (kind === "admin") { saveAdmin(form, button); return; }
    if (kind === "admin-password") { saveAdminPassword(form, button); return; }
    if (kind === "order-status") { saveOrderStatus(form, button); return; }
  });

  document.addEventListener("change", function (event) {
    var target = event.target;

    if (target.matches('[data-action="upload-images"]')) {
      uploadImages(target);
      return;
    }
    if (target.matches('[data-action="upload-brand-logo"]')) {
      uploadBrandLogo(target);
      return;
    }
    if (target.matches('[data-action="upload-banner"]')) {
      uploadBanner(target);
      return;
    }
    if (target.matches('[data-action="upload-category-image"]')) {
      uploadCategoryImage(target);
      return;
    }
    if (target.matches('[data-role="parent-cat"]')) {
      var form = target.form;
      if (form) filterSubcats(form);
    }
  });

  function productDropzone(target) {
    return target && target.closest ? target.closest('[data-dropzone="product-images"]') : null;
  }

  function activeProductForm(target) {
    if (!target || !target.closest) return null;
    var root = target.closest("#modal-root");
    return root ? root.querySelector('[data-form="product"]') : null;
  }

  function productDropTarget(target) {
    var form = activeProductForm(target);
    var zone = form ? form.querySelector('[data-dropzone="product-images"]') : productDropzone(target);
    return { form: form, zone: zone };
  }

  function dragHasImageData(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    if (!types) return false;
    var list = Array.prototype.slice.call(types);
    return list.indexOf("Files") >= 0 || list.indexOf("text/uri-list") >= 0 || list.indexOf("text/html") >= 0;
  }

  function setProductDropState(zone, active) {
    if (!zone) return;
    zone.classList.toggle("dragover", active);
    var box = zone.querySelector(".upload-dropzone");
    if (box) box.classList.toggle("dragover", active);
  }

  function clearProductDropState() {
    $$(".image-drop-area.dragover, .upload-dropzone.dragover").forEach(function (el) {
      el.classList.remove("dragover");
    });
  }

  document.addEventListener("dragenter", function (event) {
    var target = productDropTarget(event.target);
    if ((!target.form && !target.zone) || !dragHasImageData(event)) return;
    event.preventDefault();
    setProductDropState(target.zone, true);
  });

  document.addEventListener("dragover", function (event) {
    var target = productDropTarget(event.target);
    if ((!target.form && !target.zone) || !dragHasImageData(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setProductDropState(target.zone, true);
  });

  document.addEventListener("dragleave", function (event) {
    var target = productDropTarget(event.target);
    if (!target.zone) return;
    if (target.zone.contains(event.relatedTarget) || (target.form && target.form.contains(event.relatedTarget))) return;
    setProductDropState(target.zone, false);
  });

  document.addEventListener("drop", function (event) {
    var target = productDropTarget(event.target);
    if ((!target.form && !target.zone) || !dragHasImageData(event)) return;
    event.preventDefault();
    clearProductDropState();
    var files = Array.prototype.slice.call((event.dataTransfer && event.dataTransfer.files) || []);
    var fallbackUrl = draggedImageUrl(event.dataTransfer);
    uploadProductFiles(target.form || target.zone.closest("form"), files, fallbackUrl);
  });

  document.addEventListener("dragend", clearProductDropState);
  window.addEventListener("blur", clearProductDropState);

  window.addEventListener("hashchange", route);

  // ---------------------------------------------------------------------------
  // Async actions
  // ---------------------------------------------------------------------------
  async function toggleProduct(id, el) {
    try {
      var res = await api("/api/admin/products/" + encodeURIComponent(id) + "/toggle", { method: "POST", body: {} });
      toast("Product is now " + res.status + ".", "success");
      route();
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteProduct(id) {
    if (!window.confirm("Delete this product permanently? This cannot be undone.")) return;
    try {
      await api("/api/admin/products/" + encodeURIComponent(id), { method: "DELETE" });
      toast("Product deleted.", "success");
      route();
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteRecord(kind, id, label) {
    if (!window.confirm("Delete this " + label + "?")) return;
    try {
      const plural = { category: "categories", brand: "brands", banner: "banners", coupon: "coupons", review: "reviews", admin: "admins" }[kind] || kind + "s";
      await api("/api/admin/" + plural + "/" + encodeURIComponent(id), { method: "DELETE" });
      toast(label.charAt(0).toUpperCase() + label.slice(1) + " deleted.", "success");
      if (kind === "category") state.cache.categories = null;
      if (kind === "brand") state.cache.brands = null;
      route();
    } catch (err) { toast(err.message, "error"); }
  }

  async function moderateReview(id, status, el) {
    try {
      await api("/api/admin/reviews/" + encodeURIComponent(id) + "/moderate", { body: { status: status } });
      toast("Review " + status + ".", "success");
      route();
    } catch (err) { toast(err.message, "error"); }
  }

  async function saveOrderStatus(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var id = form.getAttribute("data-id");
    var status = String(fd.get("status") || "");
    var note = String(fd.get("note") || "");
    if (!status) return showFormError(form, "Select a status.");
    btnLabel(button, "Updating\u2026");
    try {
      await api("/api/admin/orders/" + encodeURIComponent(id) + "/status", { method: "PUT", body: { status: status, note: note } });
      toast("Order updated to " + status + ".", "success");
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
  }

  function readFileAsDataUrl(file, label) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("Could not read " + (label || file.name || "image"))); };
      reader.readAsDataURL(file);
    });
  }

  function imageMimeFromName(name) {
    var match = /\.(png|jpe?g|gif|webp)$/i.exec(String(name || ""));
    if (!match) return "";
    var ext = match[1].toLowerCase();
    return "image/" + (ext === "jpg" ? "jpeg" : ext);
  }

  function imageMimeFromBytes(bytes) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return "";
  }

  async function readImageFileAsDataUrl(file) {
    var declared = /^image\/(png|jpe?g|gif|webp)$/i.test(file.type) ? file.type.toLowerCase().replace(/^image\/jpg$/i, "image/jpeg") : "";
    var bytes = new Uint8Array(await file.arrayBuffer());
    var mime = imageMimeFromBytes(bytes) || declared || imageMimeFromName(file.name);
    if (!mime) return "";
    return readFileAsDataUrl(new Blob([bytes], { type: mime }), file.name || "image");
  }

  function cleanImageUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(raw)) return raw;
    if (/^\/\//.test(raw)) raw = "https:" + raw;
    try {
      var url = new URL(raw, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (e) {}
    return "";
  }

  function looksLikeImageUrl(url) {
    if (/^data:image\//i.test(url)) return true;
    try {
      return /\.(png|jpe?g|gif|webp)(?:$|[?#])/i.test(new URL(url, window.location.href).pathname);
    } catch (e) {
      return false;
    }
  }

  function draggedImageUrl(dataTransfer) {
    if (!dataTransfer) return "";
    var candidates = [];
    try {
      var html = dataTransfer.getData("text/html");
      if (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var img = doc.querySelector("img");
        var src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
        if (src) candidates.push({ value: src, trusted: true });
      }
    } catch (e) {}
    ["text/uri-list", "text/plain"].forEach(function (type) {
      var value = "";
      try { value = dataTransfer.getData(type); } catch (e) {}
      if (!value) return;
      value.split(/\r?\n/).forEach(function (line) {
        line = line.trim();
        if (line && line.charAt(0) !== "#") candidates.push({ value: line, trusted: false });
      });
    });
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var match = String(candidate.value).match(/https?:\/\/[^\s"'<>]+/i);
      var url = cleanImageUrl(match ? match[0] : candidate.value);
      if (url && (candidate.trusted || looksLikeImageUrl(url))) return url;
    }
    return "";
  }

  function addProductImageUrl(form, url) {
    var list = form.querySelector('[data-role="images"]');
    if (!list) return false;
    list.insertAdjacentHTML("beforeend", imageRow(url));
    return true;
  }

  async function uploadProductFiles(form, files, fallbackUrl) {
    if (!form) return;
    files = files || [];
    var list = form.querySelector('[data-role="images"]');
    if (!list) return;
    var uploaded = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.size > 4 * 1024 * 1024) { toast((file.name || "Image") + " is larger than 4 MB.", "error"); continue; }
      try {
        var dataUrl = await readImageFileAsDataUrl(file);
        if (!dataUrl) { toast((file.name || "Image") + " is not a supported image.", "error"); continue; }
        var res = await api("/api/admin/upload", { body: { data: dataUrl } });
        list.insertAdjacentHTML("beforeend", imageRow(res.url));
        uploaded++;
        toast("Uploaded " + (file.name || "image") + ".", "success");
      } catch (err) { toast(err.message, "error"); }
    }
    if (!uploaded && fallbackUrl && addProductImageUrl(form, fallbackUrl)) {
      toast("Image added from link.", "success");
    }
  }

  async function uploadImages(input) {
    var form = input.form;
    if (!form) return;
    var files = Array.prototype.slice.call(input.files || []);
    await uploadProductFiles(form, files);
    input.value = "";
  }

  async function uploadBrandLogo(input) {
    var form = input.form;
    var file = (input.files || [])[0];
    if (!form || !file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Image is larger than 4 MB.", "error"); input.value = ""; return; }
    try {
      var dataUrl = await readFileAsDataUrl(file);
      var res = await api("/api/admin/upload", { body: { data: dataUrl } });
      var field = form.querySelector('[name="logo"]');
      if (field) field.value = res.url;
      toast("Brand logo uploaded.", "success");
    } catch (err) { toast(err.message, "error"); }
    input.value = "";
  }

  async function uploadBanner(input) {
    var form = input.form;
    var file = (input.files || [])[0];
    if (!form || !file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Image is larger than 4 MB.", "error"); input.value = ""; return; }
    try {
      var dataUrl = await readFileAsDataUrl(file);
      var res = await api("/api/admin/upload", { body: { data: dataUrl } });
      var field = form.querySelector('[name="image"]');
      if (field) field.value = res.url;
      toast("Banner image uploaded.", "success");
    } catch (err) { toast(err.message, "error"); }
    input.value = "";
  }

  async function uploadCategoryImage(input) {
    var form = input.form;
    var file = (input.files || [])[0];
    if (!form || !file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Image is larger than 4 MB.", "error"); input.value = ""; return; }
    try {
      var dataUrl = await readFileAsDataUrl(file);
      var res = await api("/api/admin/upload", { body: { data: dataUrl } });
      var field = form.querySelector('[name="image"]');
      if (field) field.value = res.url;
      syncCategoryPreview(form);
      toast("Category image uploaded.", "success");
    } catch (err) { toast(err.message, "error"); }
    input.value = "";
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function readStoredAdmin() {
    try { return JSON.parse(localStorage.getItem(ADMIN_KEY) || "null"); } catch (e) { return null; }
  }

  async function boot() {
    try { state.token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { state.token = ""; }
    if (!state.token) { window.location.replace("/admin"); return; }

    var bootEl = $("#boot");
    try {
      var data = await api("/api/admin/me");
      state.admin = data.admin;
      try { localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin)); } catch (e) {}
    } catch (err) {
      if (err.status === 401) { logout(); return; }
      bootEl.innerHTML = '<div class="empty"><strong>Unable to connect</strong>' + esc(err.message) +
        '<div style="margin-top:12px"><button class="btn primary" type="button" data-action="logout">Back to login</button></div></div>';
      return;
    }

    if (!state.admin) { logout(); return; }
    var shell = $("#admin-shell");
    var menu = $("#menu-btn");
    if (menu) menu.setAttribute("data-action", "toggle-menu");
    var scrim = $("#sidebar-scrim");
    if (scrim) scrim.addEventListener("click", closeSidebar);

    renderNav();
    setAdminChrome();
    bindTopbar();
    normalizePath();

    if (!location.hash) {
      history.replaceState(null, "", "#/" + initialView());
    }

    bootEl.hidden = true;
    shell.hidden = false;
    route();
  }

  boot();
})();

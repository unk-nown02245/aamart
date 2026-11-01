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
    cache: {},
  };

  var STATUS_FLOW = ["Ordered", "Packed", "Shipped", "Out for Delivery", "Delivered"];

  var NAV = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ["super", "manager"], section: "Manage" },
    { id: "products", label: "Products", icon: "products", roles: ["super", "manager"] },
    { id: "orders", label: "Orders", icon: "orders", roles: ["super", "manager"] },
    { id: "reviews", label: "Reviews", icon: "reviews", roles: ["super", "manager"] },
    { id: "categories", label: "Categories", icon: "categories", roles: ["super"], section: "Store setup" },
    { id: "brands", label: "Brands", icon: "brands", roles: ["super"] },
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
    banners: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5L5 20"/>',
    coupons: '<path d="M3 9V7a2 2 0 012-2h14a2 2 0 012 2v2a3 3 0 000 6v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a3 3 0 000-6z"/><path d="M13 5v14"/>',
    customers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0112 0"/><path d="M16 5.5a3 3 0 010 5.5"/><path d="M18 20a5.5 5.5 0 00-2-4.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    admins: '<path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/>',
    inventory: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 7v10l9 5 9-5V7"/><path d="M12 12v10"/>',
    logs: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
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

  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
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

  function logout() {
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
        if (lastSection) html += '<div class="nav-sep"></div>';
        html += '<div class="nav-label">' + esc(n.section) + "</div>";
        lastSection = n.section;
      }
      html += '<a class="nav-item" href="#/' + n.id + '" data-view="' + n.id + '">' + icon(n.icon) + "<span>" + esc(n.label) + "</span></a>";
    });
    nav.innerHTML = html;
  }

  function setActiveNav() {
    $$(".nav-item").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-view") === state.view);
    });
  }

  function setAdminChrome() {
    var admin = state.admin;
    var roleEl = $("#role-label");
    if (roleEl) roleEl.textContent = roleLabel(admin.role);
    var chip = $("#admin-chip");
    if (chip) chip.innerHTML = '<span class="dot"></span>' + esc(admin.name || admin.username) + " \u00B7 " + esc(roleLabel(admin.role));
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

  function openModal(html, wide) {
    var root = $("#modal-root");
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
  }

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
    var stats = await api("/api/admin/stats");
    var recent = stats.recentOrders || [];
    var html = pageHead("Store overview", "Live figures from your database");

    html += '<div class="stats-grid">' +
      statCard("Total sales", money(stats.totalSales), stats.totalOrders + " orders", "") +
      statCard("Pending", num(stats.pendingOrders), "awaiting fulfilment", "amber") +
      statCard("Delivered", num(stats.deliveredOrders), "completed orders", "green") +
      statCard("Customers", num(stats.customers), "registered users", "") +
      statCard("Products", num(stats.products), stats.lowStock + " low \u00B7 " + stats.outOfStock + " out of stock", "blue") +
      statCard("Reviews", num(stats.pendingReviews), "pending moderation", stats.pendingReviews ? "red" : "green") +
      "</div>";

    html += '<div class="card"><div class="card-head"><h3>Recent orders</h3><a class="link-btn" href="#/orders">View all orders</a></div>';
    if (!recent.length) {
      html += emptyState("No orders yet", "New customer orders will appear here.");
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>';
      recent.forEach(function (o) {
        html += "<tr><td><strong>" + esc(o.orderNo) + "</strong></td><td>" + esc(o.customer && o.customer.name) +
          "<br><small class=\"muted\">" + esc(o.customer && o.customer.phone) + "</small></td><td class=\"mono\">" + money(o.payable) +
          "</td><td>" + statusBadge(o.status) + "</td><td class=\"nowrap muted\">" + dt(o.createdAt) + "</td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";

    $("#view").innerHTML = html;
  }

  function statCard(label, value, note, tone) {
    return '<div class="stat ' + (tone || "") + '"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' +
      value + '</div><div class="stat-note">' + esc(note || "") + "</div></div>";
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
    openModal(modalHead(id ? "Edit product" : "Add product", id ? "Update catalog details" : "Create a new catalog item") +
      '<div class="modal-body">' + productFormHtml(product, categories, brands) + "</div>", true);
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

  function productFormHtml(p, categories, brands) {
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
      "</div>" +

      '<div class="section-title">Images</div>' +
      '<div class="image-list" data-role="images">' + imageRows + "</div>" +
      '<div class="upload-box">Upload images (PNG, JPG, GIF or WEBP \u00B7 max 4 MB each)' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple data-action="upload-images"></div>' +

      '<div class="section-title">Variants</div>' +
      '<div class="rows" data-role="variants">' + variantRows + "</div>" +
      '<div style="margin-top:8px"><button class="btn small" type="button" data-action="add-variant">+ Add variant</button></div>' +

      '<div class="section-title">Specifications</div>' +
      '<div class="rows" data-role="specs">' + specRows + "</div>" +
      '<div style="margin-top:8px"><button class="btn small" type="button" data-action="add-spec">+ Add specification</button></div>' +

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
          '<td class="nowrap" style="color:#b45309">' + stars + "</td>" +
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
    html += '<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Parent</th><th>Icon</th><th>Sort</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    rows.forEach(function (c) {
      var parent = c.parent_id && byId[c.parent_id] ? byId[c.parent_id].name : "\u2014";
      html += "<tr>" +
        "<td><strong>" + esc(c.name) + "</strong><br><small class=\"muted\">" + esc(c.slug) + "</small></td>" +
        "<td>" + esc(parent) + "</td>" +
        '<td class="muted">' + esc(c.icon || "\u2014") + "</td>" +
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
    var html = modalHead(cat ? "Edit category" : "Add category", cat ? cat.slug : "Create a category or subcategory") +
      '<div class="modal-body"><form data-form="category" data-id="' + esc(cat ? cat.id : "") + '">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      '<div class="form-grid">' +
      field("Name *", '<input name="name" value="' + esc(cat ? cat.name : "") + '" required maxlength="80">', true) +
      (cat ? "" : field("Parent", '<select name="parentId">' + parentOptions + "</select>")) +
      field("Icon", '<input name="icon" value="' + esc(cat ? cat.icon || "" : "") + '" maxlength="10" placeholder="Emoji or short text">') +
      field("Sort order", '<input name="sort" type="number" step="1" value="' + esc(cat ? cat.sort : 0) + '">') +
      (activeRow ? '<div class="full">' + activeRow + "</div>" : "") +
      "</div>" +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">' + (cat ? "Save changes" : "Create category") + "</button></div>" +
      "</form></div>";
    openModal(html);
  }

  async function saveCategory(form, button) {
    clearFormError(form);
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    if (!name) return showFormError(form, "Category name is required.");
    var id = form.getAttribute("data-id");
    var body = { name: name, icon: String(fd.get("icon") || ""), sort: Number(fd.get("sort") || 0) };
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
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>Brand</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      brands.forEach(function (b) {
        html += "<tr><td><strong>" + esc(b.name) + "</strong></td><td class=\"muted\">" + esc(b.slug) + "</td><td>" +
          statusBadge(b.active ? "Active" : "Inactive") + "</td><td><button class=\"link-btn danger\" type=\"button\" data-action=\"delete-brand\" data-id=\"" +
          esc(b.id) + "\">Delete</button></td></tr>";
      });
      html += "</tbody></table></div>";
    }
    html += "</div>";
    $("#view").innerHTML = html;
  }

  function openBrandForm() {
    openModal(modalHead("Add brand", "Brands help customers filter products") +
      '<div class="modal-body"><form data-form="brand">' +
      '<div class="form-error" data-role="form-error" hidden></div>' +
      field("Brand name *", '<input name="name" required maxlength="80" placeholder="e.g. Aamart Essentials">', true) +
      '<div class="form-actions"><button class="btn" type="button" data-action="close-modal">Cancel</button>' +
      '<button class="btn primary" type="submit">Create brand</button></div></form></div>');
  }

  async function saveBrand(form, button) {
    clearFormError(form);
    var name = String(new FormData(form).get("name") || "").trim();
    if (!name) return showFormError(form, "Brand name is required.");
    btnLabel(button, "Saving\u2026");
    try {
      await api("/api/admin/brands", { body: { name: name } });
      toast("Brand created.", "success");
      state.cache.brands = null;
      closeModal();
      route();
    } catch (err) {
      showFormError(form, err.message);
      btnReset(button);
    }
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
      field("UPI ID", '<input name="upiId" value="' + esc(s.upiId || "") + '" maxlength="120">') +
      field("Support email", '<input name="supportEmail" type="email" value="' + esc(s.supportEmail || "") + '" maxlength="120">') +
      field("Support phone", '<input name="supportPhone" value="' + esc(s.supportPhone || "") + '" maxlength="20">') +
      '<label class="field full"><span>Business address</span><textarea name="address" rows="2" maxlength="300">' + esc(s.address || "") + "</textarea></label>" +
      "</div>" +
      '<div class="section-title">Payment methods</div>' +
      '<div class="form-grid">' +
      toggle("Cash on Delivery", "codEnabled", s.codEnabled) +
      toggle("UPI", "upiEnabled", s.upiEnabled) +
      toggle("Credit / Debit card", "cardEnabled", s.cardEnabled) +
      toggle("Net banking", "netbankingEnabled", s.netbankingEnabled) +
      toggle("Wallet", "walletEnabled", s.walletEnabled) +
      "</div>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>' +
      "</form></div>";
    $("#view").innerHTML = html;
  }

  function toggle(label, name, value) {
    var on = value === "1" || value === 1 || value === true;
    return '<label class="check-row"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>";
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
      field(admin ? "New password" : "Password *", '<input name="password" type="password" minlength="6" ' + (admin ? 'placeholder="Leave blank to keep current"' : "required") + '>') +
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
      if (password.length < 6) return showFormError(form, "Password must be at least 6 characters.");
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

  // ---------------------------------------------------------------------------
  // Inventory / logs
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
    var el = event.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");

    if (action === "modal-backdrop") {
      if (event.target === el) closeModal();
      return;
    }
    if (action === "close-modal") { closeModal(); return; }
    if (action === "logout") { logout(); return; }
    if (action === "retry") { route(); return; }
    if (action === "toggle-menu") { toggleSidebar(); return; }

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
    if (action === "delete-brand") { deleteRecord("brand", id, "brand"); return; }

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
    if (kind === "banner") { saveBanner(form, button); return; }
    if (kind === "coupon") { saveCoupon(form, button); return; }
    if (kind === "settings") { saveSettings(form, button); return; }
    if (kind === "admin") { saveAdmin(form, button); return; }
    if (kind === "order-status") { saveOrderStatus(form, button); return; }
  });

  document.addEventListener("change", function (event) {
    var target = event.target;

    if (target.matches('[data-action="upload-images"]')) {
      uploadImages(target);
      return;
    }
    if (target.matches('[data-action="upload-banner"]')) {
      uploadBanner(target);
      return;
    }
    if (target.matches('[data-role="parent-cat"]')) {
      var form = target.form;
      if (form) filterSubcats(form);
    }
  });

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

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("Could not read " + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  async function uploadImages(input) {
    var form = input.form;
    if (!form) return;
    var list = form.querySelector('[data-role="images"]');
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.size > 4 * 1024 * 1024) { toast(file.name + " is larger than 4 MB.", "error"); continue; }
      try {
        var dataUrl = await readFileAsDataUrl(file);
        var res = await api("/api/admin/upload", { body: { data: dataUrl } });
        list.insertAdjacentHTML("beforeend", imageRow(res.url));
        toast("Uploaded " + file.name + ".", "success");
      } catch (err) { toast(err.message, "error"); }
    }
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

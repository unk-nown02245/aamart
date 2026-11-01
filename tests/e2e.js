"use strict";

const BASE = "http://localhost:4000";
let csrf = "";
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  PASS  " + name);
  } else {
    fail++;
    failures.push(name + (detail ? " -> " + detail : ""));
    console.log("  FAIL  " + name + (detail ? " -> " + detail : ""));
  }
}

function captureCsrf(res) {
  const list = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  for (const cookie of list) {
    const m = /(?:^|;\s*)csrf=([^;]+)/.exec(cookie);
    if (m) csrf = decodeURIComponent(m[1]);
  }
}

async function req(method, path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = "Bearer " + opts.token;
  if (csrf) headers.Cookie = "csrf=" + encodeURIComponent(csrf);
  if (!["GET", "HEAD"].includes(method) && !opts.noCsrf && csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  captureCsrf(res);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  return { status: res.status, data, text, headers: res.headers };
}

function errMsg(r) {
  return r && r.data && r.data.error ? r.data.error : (r ? "status " + r.status : "no response");
}

(async function run() {
  console.log("\nAAMART end-to-end API tests\n");

  // ---------------- Health & static ----------------
  let r = await req("GET", "/api/health");
  check("health endpoint", r.status === 200 && r.data && r.data.status === "ok", errMsg(r));
  check("csrf cookie issued", !!csrf, "csrf missing");

  r = await req("GET", "/");
  check("storefront loads", r.status === 200 && /Aamart/i.test(r.text), "status " + r.status);

  r = await req("GET", "/admin");
  check("admin login page loads", r.status === 200 && /Admin Login/i.test(r.text), "status " + r.status);

  r = await req("GET", "/admin/amirhamza");
  check("admin shell route (super)", r.status === 200 && /admin-shell/i.test(r.text), "status " + r.status);

  r = await req("GET", "/admin/products");
  check("admin shell route (products)", r.status === 200 && /admin-shell/i.test(r.text), "status " + r.status);

  r = await req("GET", "/admin.css");
  check("admin css served", r.status === 200 && /--sidebar-w/.test(r.text), "status " + r.status);

  r = await req("GET", "/admin.js");
  check("admin js served", r.status === 200 && /aamart_admin_token/.test(r.text), "status " + r.status);

  // ---------------- Catalog ----------------
  r = await req("GET", "/api/settings");
  check("public settings", r.status === 200 && r.data && r.data.siteName, errMsg(r));

  r = await req("GET", "/api/categories");
  const cats = (r.data && r.data.categories) || [];
  check("category tree", r.status === 200 && cats.length > 0, "count " + cats.length);

  r = await req("GET", "/api/products?limit=50");
  const products = (r.data && r.data.products) || [];
  check("product list", r.status === 200 && products.length > 0, "count " + products.length);

  const target = products.filter(function (p) { return p.stock > 1 && p.price >= 500; })[0] || products[0];
  check("found test product", !!target, "no products");
  if (!target) return finish();

  r = await req("GET", "/api/products/" + encodeURIComponent(target.id));
  check("product detail", r.status === 200 && r.data && r.data.id === target.id, errMsg(r));

  // ---------------- Customer auth ----------------
  const stamp = Date.now().toString(36);
  const email = "e2e_" + stamp + "@aamart.test";
  const phone = "98" + String(Date.now()).slice(-8);

  r = await req("POST", "/api/auth/register", { body: { name: "E2E Tester", email, phone, password: "test1234" } });
  check("customer register", r.status === 201 && r.data && r.data.token, errMsg(r));
  let customerToken = r.data && r.data.token;

  r = await req("GET", "/api/auth/me", { token: customerToken });
  check("customer me", r.status === 200 && r.data.user.email === email, errMsg(r));

  r = await req("POST", "/api/auth/login", { body: { email, password: "test1234" } });
  check("customer login", r.status === 200 && r.data.token, errMsg(r));
  customerToken = (r.data && r.data.token) || customerToken;

  r = await req("GET", "/api/cart");
  check("cart requires auth", r.status === 401, "status " + r.status);

  r = await req("POST", "/api/cart", { token: customerToken, body: { productId: target.id, qty: 1 }, noCsrf: true });
  check("csrf enforced", r.status === 403, "status " + r.status);

  // ---------------- Cart / wishlist ----------------
  r = await req("POST", "/api/cart", { token: customerToken, body: { productId: target.id, qty: 1 } });
  check("add to cart", r.status === 200 && r.data.added, errMsg(r));

  r = await req("GET", "/api/cart", { token: customerToken });
  const cart = r.data || {};
  check("cart contents", r.status === 200 && cart.items && cart.items.length === 1 && cart.count === 1, JSON.stringify(cart));

  if (cart.items && cart.items[0]) {
    r = await req("PUT", "/api/cart/" + cart.items[0].id, { token: customerToken, body: { qty: 1 } });
    check("cart qty update", r.status === 200 && r.data.updated, errMsg(r));
  }

  r = await req("POST", "/api/wishlist", { token: customerToken, body: { productId: target.id } });
  check("wishlist add", r.status === 200 && r.data.added === true, errMsg(r));

  r = await req("GET", "/api/wishlist", { token: customerToken });
  check("wishlist list", r.status === 200 && r.data.items.length === 1, errMsg(r));

  r = await req("POST", "/api/wishlist", { token: customerToken, body: { productId: target.id } });
  check("wishlist toggle off", r.status === 200 && r.data.added === false, errMsg(r));

  // ---------------- Coupon ----------------
  r = await req("POST", "/api/coupons/validate", { token: customerToken, body: { code: "WELCOME10", itemTotal: 1000 } });
  check("coupon validate", r.status === 200 && r.data.valid && r.data.discount > 0, errMsg(r));

  r = await req("POST", "/api/coupons/validate", { token: customerToken, body: { code: "NOPE404", itemTotal: 1000 } });
  check("invalid coupon rejected", r.status === 400, "status " + r.status);

  // ---------------- Order ----------------
  const address = {
    name: "E2E Tester",
    phone: "9876543210",
    line1: "123 Test Street, Sector 5",
    line2: "Near City Mall",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001",
    type: "Home",
  };
  const useCoupon = target.price >= 499;
  r = await req("POST", "/api/orders", {
    token: customerToken,
    body: { address, paymentMethod: "COD", couponCode: useCoupon ? "WELCOME10" : "" },
  });
  check("place order", r.status === 201 && r.data && r.data.orderNo, errMsg(r));
  const order = r.data || {};
  check("order totals", order.payable > 0 && order.items && order.items.length === 1, JSON.stringify({ payable: order.payable, items: order.items && order.items.length }));

  r = await req("GET", "/api/orders", { token: customerToken });
  check("customer order list", r.status === 200 && r.data.orders.some(function (o) { return o.id === order.id; }), errMsg(r));

  r = await req("GET", "/api/orders/" + encodeURIComponent(order.id), { token: customerToken });
  check("customer order detail", r.status === 200 && r.data.id === order.id, errMsg(r));

  // ---------------- Admin auth ----------------
  r = await req("POST", "/api/admin/login", { body: { username: "amirhamza", password: "wrong-pass" } });
  check("admin rejects bad password", r.status === 401, "status " + r.status);

  r = await req("POST", "/api/admin/login", { body: { username: "amirhamza", password: "akib@123" } });
  check("super admin login", r.status === 200 && r.data.token && r.data.admin.role === "super", errMsg(r));
  const superToken = r.data && r.data.token;

  r = await req("GET", "/api/admin/me", { token: superToken });
  check("admin me", r.status === 200 && r.data.admin.username === "amirhamza", errMsg(r));

  r = await req("GET", "/api/admin/stats", { token: superToken });
  check("admin stats", r.status === 200 && typeof r.data.totalOrders === "number", errMsg(r));

  r = await req("GET", "/api/admin/products?limit=200", { token: superToken });
  check("admin product list", r.status === 200 && Array.isArray(r.data.products), errMsg(r));

  // ---------------- Admin product CRUD ----------------
  r = await req("POST", "/api/admin/products", {
    token: superToken,
    body: {
      title: "E2E Test Product " + stamp,
      description: "Created by automated test",
      categoryId: cats[0].id,
      price: 799,
      mrp: 999,
      stock: 5,
      status: "active",
      featured: true,
      images: ["/img/placeholder.svg"],
      variants: [{ type: "Size", value: "M", price: 799, stock: 5 }],
      specs: { Material: "Cotton" },
    },
  });
  check("admin create product", r.status === 201 && r.data.id, errMsg(r));
  const newProduct = r.data || {};

  r = await req("GET", "/api/admin/products/" + encodeURIComponent(newProduct.id), { token: superToken });
  check("admin product detail", r.status === 200 && r.data.title === newProduct.title, errMsg(r));

  r = await req("PUT", "/api/admin/products/" + encodeURIComponent(newProduct.id), {
    token: superToken,
    body: { price: 749, stock: 3 },
  });
  check("admin update product", r.status === 200 && r.data.price === 749 && r.data.stock === 3, errMsg(r));

  r = await req("POST", "/api/admin/products/" + encodeURIComponent(newProduct.id) + "/toggle", { token: superToken, body: {} });
  check("admin toggle product", r.status === 200 && r.data.status === "inactive", errMsg(r));

  // ---------------- Upload ----------------
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
  r = await req("POST", "/api/admin/upload", { token: superToken, body: { data: "data:image/png;base64," + png } });
  check("image upload", r.status === 201 && /^\/uploads\//.test(r.data.url || ""), errMsg(r));
  const uploadUrl = r.data && r.data.url;

  if (uploadUrl) {
    r = await req("GET", uploadUrl);
    check("uploaded image served", r.status === 200 && r.headers.get("content-type") === "image/png", "status " + r.status);
  }

  // ---------------- Admin category / brand / banner / coupon ----------------
  r = await req("POST", "/api/admin/categories", { token: superToken, body: { name: "E2E Category " + stamp, icon: "E", sort: 99 } });
  check("admin create category", r.status === 201 && r.data.id, errMsg(r));
  const catId = r.data && r.data.id;
  if (catId) {
    r = await req("PUT", "/api/admin/categories/" + encodeURIComponent(catId), { token: superToken, body: { name: "E2E Category Updated", icon: "E", sort: 98, active: true } });
    check("admin update category", r.status === 200 && r.data.name === "E2E Category Updated", errMsg(r));
    r = await req("DELETE", "/api/admin/categories/" + encodeURIComponent(catId), { token: superToken });
    check("admin delete category", r.status === 200 && r.data.deleted, errMsg(r));
  }

  r = await req("POST", "/api/admin/brands", { token: superToken, body: { name: "E2E Brand " + stamp } });
  check("admin create brand", r.status === 201 && r.data.id, errMsg(r));
  const brandId = r.data && r.data.id;
  if (brandId) {
    r = await req("DELETE", "/api/admin/brands/" + encodeURIComponent(brandId), { token: superToken });
    check("admin delete brand", r.status === 200 && r.data.deleted, errMsg(r));
  }

  r = await req("POST", "/api/admin/banners", { token: superToken, body: { title: "E2E Banner " + stamp, subtitle: "Test", image: "/img/banner1.svg", link: "/#/products", active: true, sort: 9 } });
  check("admin create banner", r.status === 201 && r.data.id, errMsg(r));
  const bannerId = r.data && r.data.id;
  if (bannerId) {
    r = await req("PUT", "/api/admin/banners/" + encodeURIComponent(bannerId), { token: superToken, body: { title: "E2E Banner Updated", active: false } });
    check("admin update banner", r.status === 200 && r.data.title === "E2E Banner Updated" && r.data.active === 0, errMsg(r));
    r = await req("DELETE", "/api/admin/banners/" + encodeURIComponent(bannerId), { token: superToken });
    check("admin delete banner", r.status === 200 && r.data.deleted, errMsg(r));
  }

  const couponCode = "E2E" + stamp.slice(-5).toUpperCase();
  r = await req("POST", "/api/admin/coupons", { token: superToken, body: { code: couponCode, type: "percent", value: 5, minOrder: 100, maxDiscount: 50, usageLimit: 10 } });
  check("admin create coupon", r.status === 201 && r.data.id, errMsg(r));
  const couponId = r.data && r.data.id;
  if (couponId) {
    r = await req("PUT", "/api/admin/coupons/" + encodeURIComponent(couponId), { token: superToken, body: { value: 6, active: false } });
    check("admin update coupon", r.status === 200 && r.data.value === 6 && r.data.active === 0, errMsg(r));
    r = await req("DELETE", "/api/admin/coupons/" + encodeURIComponent(couponId), { token: superToken });
    check("admin delete coupon", r.status === 200 && r.data.deleted, errMsg(r));
  }

  // ---------------- Settings ----------------
  r = await req("GET", "/api/admin/settings", { token: superToken });
  check("admin settings read", r.status === 200 && r.data.settings, errMsg(r));
  const originalTagline = r.data.settings.tagline || "";
  r = await req("PUT", "/api/admin/settings", { token: superToken, body: { tagline: "E2E tagline " + stamp } });
  check("admin settings update", r.status === 200 && r.data.settings.tagline === "E2E tagline " + stamp, errMsg(r));
  r = await req("PUT", "/api/admin/settings", { token: superToken, body: { tagline: originalTagline } });
  check("admin settings restored", r.status === 200, errMsg(r));

  // ---------------- Admin users / logs / inventory / customers ----------------
  const testAdminName = "e2e" + stamp.slice(-6);
  r = await req("POST", "/api/admin/admins", { token: superToken, body: { username: testAdminName, name: "E2E Manager", password: "test1234", role: "manager" } });
  check("admin create account", r.status === 201 && r.data.id, errMsg(r));
  const testAdminId = r.data && r.data.id;
  if (testAdminId) {
    r = await req("PUT", "/api/admin/admins/" + encodeURIComponent(testAdminId), { token: superToken, body: { name: "E2E Manager Updated", active: false } });
    check("admin update account", r.status === 200 && r.data.name === "E2E Manager Updated", errMsg(r));
    r = await req("DELETE", "/api/admin/admins/" + encodeURIComponent(testAdminId), { token: superToken });
    check("admin delete account", r.status === 200 && r.data.deleted, errMsg(r));
  }

  r = await req("GET", "/api/admin/logs", { token: superToken });
  check("admin logs", r.status === 200 && r.data.logs.length > 0, errMsg(r));

  r = await req("GET", "/api/admin/inventory", { token: superToken });
  check("admin inventory", r.status === 200 && r.data.inventory.length > 0, errMsg(r));

  r = await req("GET", "/api/admin/customers", { token: superToken });
  check("admin customers", r.status === 200 && r.data.customers.some(function (u) { return u.email === email; }), errMsg(r));

  // ---------------- Order status + cancel ----------------
  r = await req("PUT", "/api/admin/orders/" + encodeURIComponent(order.id) + "/status", { token: superToken, body: { status: "Packed", note: "Packed by E2E" } });
  check("admin order status update", r.status === 200 && r.data.status === "Packed", errMsg(r));

  r = await req("GET", "/api/orders/" + encodeURIComponent(order.id), { token: customerToken });
  check("customer sees status change", r.status === 200 && r.data.status === "Packed", errMsg(r));

  r = await req("POST", "/api/orders/" + encodeURIComponent(order.id) + "/cancel", { token: customerToken, body: {} });
  check("customer cancel order", r.status === 200 && r.data.status === "Cancelled", errMsg(r));

  r = await req("PUT", "/api/admin/orders/" + encodeURIComponent(order.id) + "/status", { token: superToken, body: { status: "Delivered" } });
  check("closed order rejects update", r.status === 400, "status " + r.status);

  // ---------------- Reviews ----------------
  r = await req("POST", "/api/reviews", { token: customerToken, body: { productId: target.id, rating: 5, title: "E2E review", body: "Automated test review body" } });
  check("customer submit review", r.status === 201 && r.data.submitted, errMsg(r));

  r = await req("GET", "/api/admin/reviews", { token: superToken });
  const review = (r.data.reviews || []).filter(function (x) { return x.title === "E2E review"; })[0];
  check("admin review list", r.status === 200 && !!review, errMsg(r));

  if (review) {
    r = await req("POST", "/api/admin/reviews/" + encodeURIComponent(review.id) + "/moderate", { token: superToken, body: { status: "approved" } });
    check("admin approve review", r.status === 200 && r.data.status === "approved", errMsg(r));

    r = await req("GET", "/api/products/" + encodeURIComponent(target.id));
    check("approved review public", r.status === 200 && (r.data.reviews || []).some(function (x) { return x.title === "E2E review"; }), errMsg(r));
  }

  // ---------------- Manager RBAC ----------------
  r = await req("POST", "/api/admin/login", { body: { username: "aditism", password: "aditi@123" } });
  check("manager login", r.status === 200 && r.data.admin.role === "manager", errMsg(r));
  const managerToken = r.data && r.data.token;

  r = await req("GET", "/api/admin/stats", { token: managerToken });
  check("manager can view stats", r.status === 200, errMsg(r));

  r = await req("GET", "/api/admin/products?limit=10", { token: managerToken });
  check("manager can view products", r.status === 200, errMsg(r));

  r = await req("GET", "/api/admin/settings", { token: managerToken });
  check("manager blocked from settings", r.status === 403, "status " + r.status);

  r = await req("POST", "/api/admin/categories", { token: managerToken, body: { name: "Nope" } });
  check("manager blocked from categories", r.status === 403, "status " + r.status);

  r = await req("GET", "/api/admin/customers", { token: managerToken });
  check("manager blocked from customers", r.status === 403, "status " + r.status);

  r = await req("GET", "/api/admin/logs", { token: managerToken });
  check("manager blocked from logs", r.status === 403, "status " + r.status);

  // ---------------- Cleanup product ----------------
  r = await req("DELETE", "/api/admin/products/" + encodeURIComponent(newProduct.id), { token: superToken });
  check("admin delete product", r.status === 200 && r.data.deleted, errMsg(r));

  finish();
})().catch(function (err) {
  console.error("\nUNEXPECTED TEST ERROR:", err);
  fail++;
  failures.push("unexpected: " + err.message);
  finish(1);
});

function finish(code) {
  console.log("\n----------------------------------------");
  console.log("  PASSED: " + pass + "   FAILED: " + fail);
  if (failures.length) {
    console.log("  Failures:");
    failures.forEach(function (f) { console.log("   - " + f); });
  }
  console.log("----------------------------------------\n");
  process.exitCode = code || (fail ? 1 : 0);
}

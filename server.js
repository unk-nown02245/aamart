"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { openDatabase, jsonParse, logActivity } = require("./lib/db");
const {
  loadSecret,
  hashPassword,
  verifyPassword,
  createTokenManager,
  randomId,
  randomCode,
  otp,
  slugify,
  constantTimeEqual,
} = require("./lib/security");

const PORT = Number(process.env.PORT) || 4000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SECRET = loadSecret(DATA_DIR);
const tokens = createTokenManager(SECRET);
const db = openDatabase(DATA_DIR);

const STATUS_FLOW = ["Ordered", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const PAYMENT_METHODS = { COD: "codEnabled", UPI: "upiEnabled", Card: "cardEnabled", "Net Banking": "netbankingEnabled", Wallet: "walletEnabled" };
const otpStore = new Map();
const lastOtpSent = new Map();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function setting(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function settingsObject() {
  const out = {};
  db.prepare("SELECT key, value FROM settings").all().forEach((r) => (out[r.key] = r.value));
  return out;
}

function sanitizeString(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 500);
}

function safeNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v || "").trim());
}

function normalizePhone(v) {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isPhone(v) {
  return /^[6-9]\d{9}$/.test(normalizePhone(v));
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) {
      try {
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {}
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "X-XSS-Protection": "1; mode=block",
};

function send(res, status, body, headers) {
  const h = { ...SECURITY_HEADERS, ...(headers || {}) };
  h["Content-Type"] = h["Content-Type"] || "application/json; charset=utf-8";
  res.writeHead(status, h);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function json(res, data, status) {
  send(res, status || 200, data);
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function readBody(req, maxBytes) {
  const limit = maxBytes || 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function serveFile(res, baseDir, relPath, options) {
  const opts = options || {};
  let rel = relPath;
  try {
    rel = decodeURIComponent(relPath);
  } catch {
    return fail(res, 400, "Bad path");
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  const resolved = path.resolve(baseDir, "." + rel);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) return fail(res, 403, "Forbidden");
  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      if (opts.fallback) return serveFile(res, baseDir, opts.fallback, { ...opts, fallback: null });
      return fail(res, 404, "Not found");
    }
    const ext = path.extname(resolved).toLowerCase();
    const noCache = [".html", ".css", ".js"].includes(ext);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      ...(noCache
        ? { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" }
        : { "Cache-Control": "public, max-age=86400" }),
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || "unknown";
}

const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
    rateBuckets.set(key, b);
  }
  b.count++;
  return b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (now - b.start > 60 * 60 * 1000) rateBuckets.delete(k);
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function getUserFromToken(req) {
  const token = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  return tokens.verify(token);
}

function requireCustomer(req, res) {
  const payload = getUserFromToken(req);
  if (!payload || payload.kind !== "customer" || payload.role !== "customer") {
    fail(res, 401, "Please login to continue");
    return null;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
  if (!user) {
    fail(res, 401, "Account not found");
    return null;
  }
  return user;
}

function requireAdmin(req, res, roles) {
  const payload = getUserFromToken(req);
  if (!payload || payload.kind !== "admin") {
    fail(res, 401, "Admin login required");
    return null;
  }
  const admin = db.prepare("SELECT * FROM admins WHERE id = ? AND active = 1").get(payload.id);
  if (!admin) {
    fail(res, 401, "Admin account not found or disabled");
    return null;
  }
  if (roles && roles.length && !roles.includes(admin.role)) {
    fail(res, 403, "You do not have permission for this action");
    return null;
  }
  return admin;
}

function sanitizeUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at };
}

function publicSettings() {
  const s = settingsObject();
  return {
    siteName: s.siteName || "Aamart",
    tagline: s.tagline || "",
    currency: s.currency || "INR",
    deliveryCharge: Number(s.deliveryCharge || 0),
    freeDeliveryAbove: Number(s.freeDeliveryAbove || 0),
    taxPercent: Number(s.taxPercent || 0),
    paymentMethods: {
      COD: s.codEnabled === "1",
      UPI: s.upiEnabled === "1",
      Card: s.cardEnabled === "1",
      "Net Banking": s.netbankingEnabled === "1",
      Wallet: s.walletEnabled === "1",
    },
    upiId: s.upiId || "",
    supportEmail: s.supportEmail || "",
    supportPhone: s.supportPhone || "",
  };
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------
function getCategory(id) {
  return id ? db.prepare("SELECT * FROM categories WHERE id = ?").get(id) : null;
}

function productImages(productId) {
  const rows = db.prepare("SELECT url FROM product_images WHERE product_id = ? ORDER BY sort ASC").all(productId);
  return rows.length ? rows.map((r) => r.url) : ["/img/placeholder.svg"];
}

function serializeProduct(row, adminView) {
  if (!row) return null;
  const category = getCategory(row.category_id);
  const sub = getCategory(row.subcategory_id);
  const brand = row.brand_id ? db.prepare("SELECT * FROM brands WHERE id = ?").get(row.brand_id) : null;
  const images = productImages(row.id);
  const variants = db.prepare("SELECT id, type, value, price, stock FROM product_variants WHERE product_id = ?").all(row.id);
  return {
    id: row.id,
    title: row.title,
    name: row.title,
    slug: row.slug,
    description: row.description,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    category: category ? category.name : "",
    sub: sub ? sub.name : "",
    subcategory: sub ? sub.name : "",
    brandId: row.brand_id,
    brand: brand ? brand.name : "",
    price: row.price,
    mrp: row.mrp,
    discount: row.discount,
    stock: row.stock,
    sku: row.sku,
    status: row.status,
    featured: !!row.featured,
    rating: row.rating,
    ratingCount: row.rating_count,
    specs: jsonParse(row.specs, {}),
    variants,
    images,
    image: images[0],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(adminView ? { categoryName: category ? category.name : "", subcategoryName: sub ? sub.name : "", brandName: brand ? brand.name : "" } : {}),
  };
}

function productList(filters) {
  const f = filters || {};
  const where = [];
  const params = [];
  if (!f.includeInactive) where.push("status = 'active'");
  if (f.status === "active" || f.status === "inactive") {
    where.push("status = ?");
    params.push(f.status);
  }
  if (f.q) {
    const like = "%" + String(f.q).toLowerCase() + "%";
    where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(slug) LIKE ?)");
    params.push(like, like, like, like);
  }
  if (f.category) {
    const key = String(f.category).toLowerCase();
    const cat = db.prepare("SELECT id FROM categories WHERE id = ? OR LOWER(slug) = ? OR LOWER(name) = ?").get(f.category, key, key);
    if (cat) {
      const ids = [cat.id].concat(db.prepare("SELECT id FROM categories WHERE parent_id = ?").all(cat.id).map((r) => r.id));
      where.push("category_id IN (" + ids.map(() => "?").join(",") + ")");
      params.push(...ids);
    }
  }
  if (f.sub) {
    const key = String(f.sub).toLowerCase();
    const sub = db.prepare("SELECT id FROM categories WHERE id = ? OR LOWER(slug) = ? OR LOWER(name) = ?").get(f.sub, key, key);
    if (sub) {
      where.push("subcategory_id = ?");
      params.push(sub.id);
    }
  }
  if (f.brand) {
    const b = db.prepare("SELECT id FROM brands WHERE id = ? OR LOWER(name) = ?").get(f.brand, String(f.brand).toLowerCase());
    if (b) {
      where.push("brand_id = ?");
      params.push(b.id);
    }
  }
  if (f.minPrice != null && f.minPrice !== "") {
    where.push("price >= ?");
    params.push(Number(f.minPrice));
  }
  if (f.maxPrice != null && f.maxPrice !== "") {
    where.push("price <= ?");
    params.push(Number(f.maxPrice));
  }
  if (f.rating != null && f.rating !== "") {
    where.push("rating >= ?");
    params.push(Number(f.rating));
  }
  if (f.minDiscount != null && f.minDiscount !== "") {
    where.push("discount >= ?");
    params.push(Number(f.minDiscount));
  }
  if (f.availability === "in") where.push("stock > 0");
  if (f.availability === "out") where.push("stock <= 0");
  if (f.featured) where.push("featured = 1");

  const order = {
    "price-asc": "price ASC",
    "price-desc": "price DESC",
    newest: "created_at DESC",
    discount: "discount DESC",
    rating: "rating DESC",
    popularity: "rating_count DESC, rating DESC",
  }[f.sort] || "rating_count DESC, rating DESC";

  const limit = clampInt(f.limit, 1, 200, 40);
  const offset = clampInt(f.offset, 0, 1000000, 0);
  const whereSql = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = db.prepare("SELECT COUNT(*) AS c FROM products" + whereSql).get(...params).c;
  const rows = db.prepare("SELECT * FROM products" + whereSql + " ORDER BY " + order + " LIMIT ? OFFSET ?").all(...params, limit, offset);
  return { products: rows.map((r) => serializeProduct(r, f.adminView)), total };
}

function categoryTree() {
  const rows = db.prepare("SELECT * FROM categories WHERE active = 1 ORDER BY sort ASC, name ASC").all();
  const counts = {};
  db.prepare("SELECT category_id, COUNT(*) AS c FROM products WHERE status = 'active' GROUP BY category_id").all().forEach((r) => {
    counts[r.category_id] = r.c;
  });
  const parents = rows.filter((r) => !r.parent_id);
  return parents.map((p) => {
    const subs = rows.filter((r) => r.parent_id === p.id);
    const count = (counts[p.id] || 0) + subs.reduce((s, x) => s + (counts[x.id] || 0), 0);
    return {
      id: p.id, name: p.name, slug: p.slug, icon: p.icon, count,
      subs: subs.map((s) => ({ id: s.id, name: s.name, slug: s.slug, count: counts[s.id] || 0 })),
    };
  });
}

// ---------------------------------------------------------------------------
// Coupons / totals
// ---------------------------------------------------------------------------
function findCoupon(code) {
  return db.prepare("SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND active = 1").get(String(code || "").trim());
}

function couponError(coupon, itemTotal) {
  if (!coupon) return "Invalid coupon code";
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return "This coupon has expired";
  if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) return "This coupon has reached its usage limit";
  if (itemTotal < coupon.min_order) return "Minimum order of \u20B9" + coupon.min_order + " required for this coupon";
  return null;
}

function computeTotals(itemTotal, coupon) {
  const s = settingsObject();
  let discount = 0;
  if (coupon) {
    discount = coupon.type === "percent" ? (itemTotal * coupon.value) / 100 : coupon.value;
    if (coupon.max_discount > 0) discount = Math.min(discount, coupon.max_discount);
    discount = Math.min(discount, itemTotal);
  }
  const afterDiscount = Math.max(0, itemTotal - discount);
  const freeAbove = Number(s.freeDeliveryAbove || 0);
  const baseDelivery = Number(s.deliveryCharge || 0);
  const deliveryCharge = itemTotal > 0 && (freeAbove === 0 || afterDiscount >= freeAbove) ? 0 : baseDelivery;
  const tax = Math.round(((afterDiscount * Number(s.taxPercent || 0)) / 100) * 100) / 100;
  return {
    itemTotal: money(itemTotal),
    discount: money(discount),
    deliveryCharge: money(deliveryCharge),
    tax,
    payable: money(afterDiscount + deliveryCharge + tax),
  };
}

// ---------------------------------------------------------------------------
// Orders / reviews helpers
// ---------------------------------------------------------------------------
function serializeOrder(row, adminView) {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id).map((i) => ({
    id: i.id, productId: i.product_id, name: i.name, price: i.price, qty: i.qty, image: i.image, variant: i.variant,
  }));
  const history = db.prepare("SELECT status, note, by, at FROM order_status_history WHERE order_id = ? ORDER BY at ASC").all(row.id);
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
    items,
    itemTotal: row.item_total,
    discount: row.discount,
    deliveryCharge: row.delivery_charge,
    tax: row.tax,
    payable: row.payable,
    total: row.payable,
    couponCode: row.coupon_code,
    address: jsonParse(row.address_json, {}),
    payment: { method: row.payment_method, status: row.payment_status },
    status: row.status,
    history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(adminView ? { user: row.user_id ? db.prepare("SELECT id, name, email, phone FROM users WHERE id = ?").get(row.user_id) : null } : {}),
  };
}

function addHistory(orderId, status, note, by) {
  db.prepare("INSERT INTO order_status_history(id, order_id, status, note, by, at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomId("osh"), orderId, status, note || "", by || "", nowIso());
}

function addInventory(productId, change, reason, by) {
  db.prepare("INSERT INTO inventory(id, product_id, change, reason, by, at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomId("inv"), productId, change, reason || "", by || "", nowIso());
}

function recalcRating(productId) {
  const agg = db.prepare("SELECT COUNT(*) AS c, COALESCE(AVG(rating),0) AS avg FROM reviews WHERE product_id = ? AND status = 'approved'").get(productId);
  db.prepare("UPDATE products SET rating = ?, rating_count = ? WHERE id = ?").run(Math.round(agg.avg * 10) / 10, agg.c, productId);
}

// ---------------------------------------------------------------------------
// Product build helpers
// ---------------------------------------------------------------------------
function normalizeSpecs(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  Object.keys(input).slice(0, 30).forEach((k) => {
    const key = sanitizeString(k, 60);
    if (key) out[key] = sanitizeString(input[k], 300);
  });
  return out;
}

function normalizeVariants(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 30).map((v) => ({
    type: sanitizeString(v && v.type, 40) || "Option",
    value: sanitizeString(v && v.value, 60),
    price: v && v.price != null && v.price !== "" ? safeNumber(v.price, 0) : null,
    stock: v && v.stock != null && v.stock !== "" ? clampInt(v.stock, 0, 1000000, 0) : null,
  })).filter((v) => v.value);
}

function buildProduct(body, existing) {
  const cur = existing || {};
  const title = body && body.title != null ? sanitizeString(body.title, 200) : cur.title;
  if (!title || title.length < 3) return { error: "Product title must be at least 3 characters" };
  const price = body && body.price != null ? safeNumber(body.price, -1) : cur.price;
  const mrp = body && body.mrp != null ? safeNumber(body.mrp, -1) : cur.mrp;
  if (price < 0) return { error: "Price must be a valid positive number" };
  if (mrp < 0) return { error: "MRP must be a valid positive number" };
  if (mrp > 0 && price > mrp) return { error: "Selling price cannot be greater than MRP" };
  const stock = body && body.stock != null ? clampInt(body.stock, 0, 1000000, 0) : (cur.stock || 0);
  const discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

  let categoryId = body && body.categoryId != null ? body.categoryId : cur.category_id;
  let subcategoryId = body && body.subcategoryId != null ? body.subcategoryId : cur.subcategory_id;
  const catName = body && body.category != null ? sanitizeString(body.category, 80) : null;
  const subName = body && body.subcategory != null ? sanitizeString(body.subcategory, 80) : null;
  if (catName) {
    const cat = db.prepare("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)").get(catName);
    if (cat) categoryId = cat.id;
  }
  if (subName) {
    const sub = db.prepare("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)").get(subName);
    if (sub) subcategoryId = sub.id;
  }
  let brandId = body && body.brandId != null ? body.brandId : cur.brand_id;
  const brandName = body && body.brand != null ? sanitizeString(body.brand, 80) : null;
  if (brandName) {
    let b = db.prepare("SELECT id FROM brands WHERE LOWER(name) = LOWER(?)").get(brandName);
    if (!b) {
      const id = randomId("brd");
      db.prepare("INSERT INTO brands(id, name, slug, active) VALUES (?, ?, ?, 1)").run(id, brandName, slugify(brandName) + "-" + randomCode(3).toLowerCase());
      b = { id };
    }
    brandId = b.id;
  }
  const status = body && body.status != null ? (body.status === "inactive" ? "inactive" : "active") : (cur.status || "active");
  const featured = body && body.featured != null ? (body.featured ? 1 : 0) : (cur.featured || 0);
  const description = body && body.description != null ? sanitizeString(body.description, 5000) : (cur.description || "");
  const sku = body && body.sku != null ? sanitizeString(body.sku, 60) : (cur.sku || "AAM-" + randomCode(8));
  const specs = body && body.specs !== undefined ? normalizeSpecs(body.specs) : jsonParse(cur.specs, {});
  const variants = body && body.variants !== undefined ? normalizeVariants(body.variants) : jsonParse(cur.variants, []);
  let images = null;
  if (body && body.images !== undefined) {
    if (!Array.isArray(body.images)) return { error: "Images must be an array of URLs" };
    images = body.images.map((u) => sanitizeString(u, 300)).filter((u) => /^\/[A-Za-z0-9_./-]+$/.test(u)).slice(0, 8);
    if (!images.length) images = ["/img/placeholder.svg"];
  }
  return { title, price, mrp, discount, stock, categoryId: categoryId || null, subcategoryId: subcategoryId || null, brandId: brandId || null, status, featured, description, sku, specs, variants, images };
}

function uniqueSlug(title, excludeId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (true) {
    const row = db.prepare("SELECT id FROM products WHERE slug = ?").get(slug);
    if (!row || row.id === excludeId) return slug;
    slug = base + "-" + n++;
  }
}

function saveProductImages(productId, images) {
  if (!Array.isArray(images)) return;
  db.prepare("DELETE FROM product_images WHERE product_id = ?").run(productId);
  const ins = db.prepare("INSERT INTO product_images(id, product_id, url, sort) VALUES (?, ?, ?, ?)");
  images.slice(0, 8).forEach((url, i) => ins.run(randomId("img"), productId, url, i));
}

function saveProductVariants(productId, variants) {
  db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(productId);
  const ins = db.prepare("INSERT INTO product_variants(id, product_id, type, value, price, stock) VALUES (?, ?, ?, ?, ?, ?)");
  (variants || []).slice(0, 30).forEach((v) => ins.run(randomId("var"), productId, v.type, v.value, v.price, v.stock));
}

function normalizeAddress(input) {
  const a = {
    name: sanitizeString(input && input.name, 80),
    phone: normalizePhone(input && input.phone),
    line1: sanitizeString(input && input.line1, 160),
    line2: sanitizeString(input && input.line2, 160),
    city: sanitizeString(input && input.city, 80),
    state: sanitizeString(input && input.state, 80),
    pincode: sanitizeString(input && input.pincode, 10),
    type: sanitizeString(input && input.type, 20) || "Home",
  };
  if (a.name.length < 2) return { error: "Please enter the recipient name" };
  if (!isPhone(a.phone)) return { error: "Please enter a valid 10-digit mobile number" };
  if (a.line1.length < 5) return { error: "Please enter the full address" };
  if (!a.city) return { error: "Please enter the city" };
  if (!a.state) return { error: "Please enter the state" };
  if (!/^\d{5,6}$/.test(a.pincode)) return { error: "Please enter a valid PIN code" };
  return a;
}

function saveUpload(dataUrl, uploadsDir) {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
  if (!m) return { error: "Only PNG, JPG, GIF or WEBP images are allowed" };
  const mime = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (buf.length < 32) return { error: "Image file is empty or corrupt" };
  if (buf.length > 4 * 1024 * 1024) return { error: "Image must be smaller than 4 MB" };
  let ext = null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = ".png";
  else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = ".jpg";
  else if (buf.slice(0, 6).toString("ascii") === "GIF87a" || buf.slice(0, 6).toString("ascii") === "GIF89a") ext = ".gif";
  else if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") ext = ".webp";
  if (!ext) return { error: "File content is not a valid image" };
  const allowed = { ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
  if (allowed[ext] !== mime) return { error: "Image type mismatch" };
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = "img_" + Date.now().toString(36) + crypto.randomBytes(6).toString("hex") + ext;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return { url: "/uploads/" + name };
}

// ---------------------------------------------------------------------------
// API router
// ---------------------------------------------------------------------------
async function handleApi(req, res, pathname, parsed) {
  const method = req.method;
  const seg = pathname.split("/").filter(Boolean);
  const ip = clientIp(req);

  if (!rateLimit("api:" + ip, 900, 60 * 1000)) return fail(res, 429, "Too many requests. Please slow down.");

  if (seg[1] === "health" && method === "GET") {
    return json(res, { status: "ok", name: "Aamart", time: nowIso() });
  }

  // CSRF double-submit check for state-changing requests (skip auth entry points)
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method);
  const authEntry = seg[1] === "auth" && ["register", "login", "send-otp", "verify-otp", "forgot-password", "reset-password"].includes(seg[2]);
  const adminLogin = seg[1] === "admin" && seg[2] === "login";
  if (isStateChanging && !authEntry && !adminLogin) {
    const cookie = parseCookies(req).csrf;
    const header = req.headers["x-csrf-token"];
    if (!cookie || !header || !constantTimeEqual(cookie, header)) {
      return fail(res, 403, "Invalid or missing CSRF token. Please refresh the page.");
    }
  }

  // ---------------- Customer auth ----------------
  if (seg[1] === "auth" && seg[2] === "register" && method === "POST") {
    if (!rateLimit("reg:" + ip, 10, 60 * 60 * 1000)) return fail(res, 429, "Too many registration attempts. Try later.");
    const body = await readBody(req);
    if (!body) return fail(res, 400, "Invalid request body");
    const name = sanitizeString(body.name, 80);
    const email = sanitizeString(body.email, 120).toLowerCase();
    const phone = normalizePhone(body.phone);
    const password = String(body.password || "");
    if (name.length < 2) return fail(res, 400, "Please enter your full name");
    if (!isEmail(email)) return fail(res, 400, "Please enter a valid email address");
    if (!isPhone(phone)) return fail(res, 400, "Please enter a valid 10-digit mobile number");
    if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters");
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return fail(res, 409, "This email is already registered. Please login.");
    const id = randomId("usr");
    const at = nowIso();
    db.prepare("INSERT INTO users(id, name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)")
      .run(id, name, email, phone, hashPassword(password), at, at);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    const token = tokens.sign({ id, role: "customer", kind: "customer" });
    logActivity(db, { actor: email, role: "customer", action: "register", ip });
    return json(res, { token, user: sanitizeUser(user) }, 201);
  }

  if (seg[1] === "auth" && seg[2] === "login" && method === "POST") {
    if (!rateLimit("login:" + ip, 15, 15 * 60 * 1000)) return fail(res, 429, "Too many login attempts. Please wait 15 minutes.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const password = String((body && body.password) || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) return fail(res, 401, "Invalid email or password");
    const token = tokens.sign({ id: user.id, role: "customer", kind: "customer" });
    logActivity(db, { actor: user.email, role: "customer", action: "login", ip });
    return json(res, { token, user: sanitizeUser(user) });
  }

  if (seg[1] === "auth" && seg[2] === "me" && method === "GET") {
    const user = requireCustomer(req, res);
    if (!user) return;
    return json(res, { user: sanitizeUser(user) });
  }

  if (seg[1] === "auth" && seg[2] === "update" && method === "PUT") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!body) return fail(res, 400, "Invalid request body");
    const name = body.name != null ? sanitizeString(body.name, 80) : user.name;
    const phone = body.phone != null ? normalizePhone(body.phone) : user.phone;
    if (name.length < 2) return fail(res, 400, "Please enter your full name");
    if (!isPhone(phone)) return fail(res, 400, "Please enter a valid 10-digit mobile number");
    let passwordHash = user.password_hash;
    if (body.password) {
      if (String(body.password).length < 6) return fail(res, 400, "Password must be at least 6 characters");
      if (!verifyPassword(String(body.currentPassword || ""), user.password_hash)) return fail(res, 400, "Current password is incorrect");
      passwordHash = hashPassword(String(body.password));
    }
    db.prepare("UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = ? WHERE id = ?")
      .run(name, phone, passwordHash, nowIso(), user.id);
    logActivity(db, { actor: user.email, role: "customer", action: "profile_update", ip });
    return json(res, { user: sanitizeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
  }

  if (seg[1] === "auth" && seg[2] === "send-otp" && method === "POST") {
    if (!rateLimit("otp:" + ip, 8, 10 * 60 * 1000)) return fail(res, 429, "Too many OTP requests. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    if (!isEmail(email)) return fail(res, 400, "Please enter a valid email address");
    if (Date.now() - (lastOtpSent.get(email) || 0) < 30 * 1000) return fail(res, 429, "Please wait 30 seconds before requesting a new OTP");
    lastOtpSent.set(email, Date.now());
    const code = otp();
    otpStore.set(email, { code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
    console.log("[AAMART] OTP for " + email + " -> " + code);
    return json(res, { sent: true, expiresIn: 300, demoOtp: code });
  }

  if (seg[1] === "auth" && seg[2] === "verify-otp" && method === "POST") {
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const rec = otpStore.get(email);
    if (!rec) return fail(res, 400, "OTP was not requested or has expired");
    if (rec.expires < Date.now()) { otpStore.delete(email); return fail(res, 400, "OTP expired. Please resend."); }
    rec.attempts++;
    if (rec.attempts > 5) { otpStore.delete(email); return fail(res, 429, "Too many incorrect attempts. Request a new OTP."); }
    if (!constantTimeEqual(String(body && body.otp), rec.code)) return fail(res, 400, "Incorrect OTP");
    otpStore.delete(email);
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      const id = randomId("usr");
      const at = nowIso();
      const name = sanitizeString(body.name, 80) || email.split("@")[0];
      db.prepare("INSERT INTO users(id, name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, '', ?, 'customer', ?, ?)")
        .run(id, name, email, hashPassword(randomCode(24)), at, at);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    }
    const token = tokens.sign({ id: user.id, role: "customer", kind: "customer" });
    return json(res, { token, user: sanitizeUser(user) });
  }

  if (seg[1] === "auth" && seg[2] === "forgot-password" && method === "POST") {
    if (!rateLimit("forgot:" + ip, 8, 10 * 60 * 1000)) return fail(res, 429, "Too many requests. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      const code = otp();
      otpStore.set(email, { code, expires: Date.now() + 10 * 60 * 1000, attempts: 0, reset: true });
      console.log("[AAMART] Password reset OTP for " + email + " -> " + code);
    }
    return json(res, { sent: true, message: "If an account exists, a reset OTP has been sent." });
  }

  if (seg[1] === "auth" && seg[2] === "reset-password" && method === "POST") {
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const rec = otpStore.get(email);
    if (!rec || !rec.reset) return fail(res, 400, "Reset OTP was not requested or has expired");
    if (rec.expires < Date.now()) { otpStore.delete(email); return fail(res, 400, "OTP expired. Please resend."); }
    rec.attempts++;
    if (rec.attempts > 5) { otpStore.delete(email); return fail(res, 429, "Too many incorrect attempts."); }
    if (!constantTimeEqual(String(body && body.otp), rec.code)) return fail(res, 400, "Incorrect OTP");
    if (String(body.password || "").length < 6) return fail(res, 400, "Password must be at least 6 characters");
    otpStore.delete(email);
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) return fail(res, 404, "Account not found");
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(String(body.password)), nowIso(), user.id);
    return json(res, { reset: true });
  }

  // ---------------- Public catalog ----------------
  if (seg[1] === "settings" && method === "GET") return json(res, publicSettings());

  if (seg[1] === "categories" && method === "GET") return json(res, { categories: categoryTree() });

  if (seg[1] === "brands" && method === "GET") {
    return json(res, { brands: db.prepare("SELECT id, name, slug FROM brands WHERE active = 1 ORDER BY name").all() });
  }

  if (seg[1] === "banners" && method === "GET") {
    return json(res, { banners: db.prepare("SELECT * FROM banners WHERE active = 1 ORDER BY sort ASC").all() });
  }

  if (seg[1] === "products" && seg.length === 2 && method === "GET") {
    return json(res, productList({
      q: parsed.searchParams.get("q") || "",
      category: parsed.searchParams.get("category") || "",
      sub: parsed.searchParams.get("sub") || "",
      brand: parsed.searchParams.get("brand") || "",
      minPrice: parsed.searchParams.get("minPrice"),
      maxPrice: parsed.searchParams.get("maxPrice"),
      rating: parsed.searchParams.get("rating"),
      minDiscount: parsed.searchParams.get("discount"),
      availability: parsed.searchParams.get("availability") || "",
      sort: parsed.searchParams.get("sort") || "",
      featured: parsed.searchParams.get("featured") === "1",
      limit: parsed.searchParams.get("limit") || 40,
      offset: parsed.searchParams.get("offset") || 0,
    }));
  }

  if (seg[1] === "products" && seg.length === 3 && method === "GET") {
    const row = db.prepare("SELECT * FROM products WHERE (id = ? OR slug = ?) AND status = 'active'").get(seg[2], seg[2]);
    if (!row) return fail(res, 404, "Product not found");
    const product = serializeProduct(row);
    const reviews = db.prepare("SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 30").all(row.id);
    const related = db.prepare("SELECT * FROM products WHERE status = 'active' AND id != ? AND (category_id = ? OR subcategory_id = ?) ORDER BY rating DESC LIMIT 8").all(row.id, row.category_id, row.subcategory_id).map((r) => serializeProduct(r));
    return json(res, { ...product, reviews, related });
  }

  if (seg[1] === "products" && seg.length === 4 && seg[3] === "reviews" && method === "GET") {
    return json(res, { reviews: db.prepare("SELECT id, name, rating, title, body, created_at FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC").all(seg[2]) });
  }

  if (seg[1] === "coupons" && seg[2] === "validate" && method === "POST") {
    const body = await readBody(req);
    const coupon = findCoupon(body && body.code);
    const itemTotal = safeNumber(body && body.itemTotal, 0);
    const err = couponError(coupon, itemTotal);
    if (err) return fail(res, 400, err);
    return json(res, { valid: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, maxDiscount: coupon.max_discount }, ...computeTotals(itemTotal, coupon) });
  }

  // ---------------- Cart ----------------
  if (seg[1] === "cart") {
    const user = requireCustomer(req, res);
    if (!user) return;

    if (seg.length === 2 && method === "GET") {
      const rows = db.prepare("SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
      const items = [];
      const saved = [];
      for (const r of rows) {
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(r.product_id);
        if (!p) continue;
        const entry = {
          id: r.id, productId: p.id, qty: r.qty, variant: r.variant, saved: !!r.saved,
          name: p.title, price: p.price, mrp: p.mrp, image: productImages(p.id)[0],
          stock: p.stock, status: p.status, lineTotal: money(p.price * r.qty),
        };
        (r.saved ? saved : items).push(entry);
      }
      return json(res, { items, saved, itemTotal: money(items.reduce((s, i) => s + i.lineTotal, 0)), count: items.reduce((s, i) => s + i.qty, 0) });
    }

    if (seg.length === 2 && method === "POST") {
      const body = await readBody(req);
      const productId = sanitizeString(body && body.productId, 80);
      const variant = sanitizeString(body && body.variant, 80);
      const qty = clampInt(body && body.qty, 1, 20, 1);
      const p = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(productId);
      if (!p) return fail(res, 404, "Product not available");
      if (p.stock <= 0) return fail(res, 400, "This product is out of stock");
      const existing = db.prepare("SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND variant = ? AND saved = 0").get(user.id, productId, variant);
      if (existing) {
        db.prepare("UPDATE cart_items SET qty = ? WHERE id = ?").run(Math.min(20, existing.qty + qty, p.stock), existing.id);
      } else {
        db.prepare("INSERT INTO cart_items(id, user_id, product_id, variant, qty, saved, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
          .run(randomId("crt"), user.id, productId, variant, Math.min(qty, p.stock), nowIso());
      }
      return json(res, { added: true });
    }

    if (seg.length === 3 && seg[2] === "clear" && method === "POST") {
      db.prepare("DELETE FROM cart_items WHERE user_id = ? AND saved = 0").run(user.id);
      return json(res, { cleared: true });
    }

    if (seg.length === 3 && method === "PUT") {
      const body = await readBody(req);
      const item = db.prepare("SELECT * FROM cart_items WHERE id = ? AND user_id = ?").get(seg[2], user.id);
      if (!item) return fail(res, 404, "Cart item not found");
      if (body.qty != null) {
        const p = db.prepare("SELECT stock FROM products WHERE id = ?").get(item.product_id);
        const max = Math.max(1, Math.min(20, p ? p.stock : 20));
        db.prepare("UPDATE cart_items SET qty = ? WHERE id = ?").run(clampInt(body.qty, 1, max, 1), item.id);
      }
      if (body.saved != null) db.prepare("UPDATE cart_items SET saved = ? WHERE id = ?").run(body.saved ? 1 : 0, item.id);
      return json(res, { updated: true });
    }

    if (seg.length === 3 && method === "DELETE") {
      db.prepare("DELETE FROM cart_items WHERE id = ? AND user_id = ?").run(seg[2], user.id);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Wishlist ----------------
  if (seg[1] === "wishlist") {
    const user = requireCustomer(req, res);
    if (!user) return;

    if (seg.length === 2 && method === "GET") {
      const rows = db.prepare("SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
      const items = rows.map((r) => {
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(r.product_id);
        return p ? serializeProduct(p) : null;
      }).filter(Boolean);
      return json(res, { items });
    }

    if (seg.length === 2 && method === "POST") {
      const body = await readBody(req);
      const productId = sanitizeString(body && body.productId, 80);
      if (!db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) return fail(res, 404, "Product not found");
      const existing = db.prepare("SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?").get(user.id, productId);
      if (existing) {
        db.prepare("DELETE FROM wishlist WHERE id = ?").run(existing.id);
        return json(res, { added: false });
      }
      db.prepare("INSERT INTO wishlist(id, user_id, product_id, created_at) VALUES (?, ?, ?, ?)").run(randomId("wsh"), user.id, productId, nowIso());
      return json(res, { added: true });
    }

    if (seg.length === 3 && method === "DELETE") {
      db.prepare("DELETE FROM wishlist WHERE product_id = ? AND user_id = ?").run(seg[2], user.id);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Addresses ----------------
  if (seg[1] === "addresses") {
    const user = requireCustomer(req, res);
    if (!user) return;

    if (seg.length === 2 && method === "GET") {
      return json(res, { addresses: db.prepare("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC").all(user.id) });
    }

    if (seg.length === 2 && method === "POST") {
      const body = await readBody(req);
      const a = normalizeAddress(body);
      if (a.error) return fail(res, 400, a.error);
      if (body.isDefault) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
      const id = randomId("adr");
      db.prepare("INSERT INTO addresses(id, user_id, name, phone, line1, line2, city, state, pincode, type, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, user.id, a.name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode, a.type, body.isDefault ? 1 : 0, nowIso());
      return json(res, db.prepare("SELECT * FROM addresses WHERE id = ?").get(id), 201);
    }

    if (seg.length === 3 && method === "PUT") {
      const body = await readBody(req);
      const existing = db.prepare("SELECT * FROM addresses WHERE id = ? AND user_id = ?").get(seg[2], user.id);
      if (!existing) return fail(res, 404, "Address not found");
      const a = normalizeAddress({ ...existing, ...body });
      if (a.error) return fail(res, 400, a.error);
      if (body.isDefault) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
      db.prepare("UPDATE addresses SET name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, type = ?, is_default = ? WHERE id = ?")
        .run(a.name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode, a.type, body.isDefault ? 1 : existing.is_default, existing.id);
      return json(res, db.prepare("SELECT * FROM addresses WHERE id = ?").get(existing.id));
    }

    if (seg.length === 3 && method === "DELETE") {
      db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(seg[2], user.id);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Orders (customer) ----------------
  if (seg[1] === "orders" && seg.length === 2 && method === "POST") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!body) return fail(res, 400, "Invalid request body");
    const a = normalizeAddress(body.address || {});
    if (a.error) return fail(res, 400, a.error);
    const method = sanitizeString(body.paymentMethod, 30) || "COD";
    if (!PAYMENT_METHODS[method]) return fail(res, 400, "Invalid payment method");
    if (setting(PAYMENT_METHODS[method], "1") !== "1") return fail(res, 400, method + " is currently unavailable");

    const cartRows = db.prepare("SELECT * FROM cart_items WHERE user_id = ? AND saved = 0").all(user.id);
    if (!cartRows.length) return fail(res, 400, "Your cart is empty");

    const items = [];
    let itemTotal = 0;
    for (const r of cartRows) {
      const p = db.prepare("SELECT * FROM products WHERE id = ?").get(r.product_id);
      if (!p || p.status !== "active") return fail(res, 400, "A product in your cart is no longer available");
      if (p.stock < r.qty) return fail(res, 400, "Only " + p.stock + " left of " + p.title);
      itemTotal += p.price * r.qty;
      items.push({ product: p, qty: r.qty, variant: r.variant });
    }

    let coupon = null;
    if (body.couponCode) {
      coupon = findCoupon(body.couponCode);
      const err = couponError(coupon, itemTotal);
      if (err) return fail(res, 400, err);
    }
    const totals = computeTotals(itemTotal, coupon);
    const id = randomId("ord");
    const orderNo = "AAM" + Date.now().toString(36).toUpperCase().slice(-8) + randomCode(3);
    const at = nowIso();

    db.exec("BEGIN");
    try {
      db.prepare(`INSERT INTO orders(id, order_no, user_id, customer_name, customer_phone, customer_email, item_total, discount, delivery_charge, tax, payable, coupon_code, address_json, payment_method, payment_status, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ordered', ?, ?)`)
        .run(id, orderNo, user.id, a.name, a.phone, user.email, totals.itemTotal, totals.discount, totals.deliveryCharge, totals.tax, totals.payable,
          coupon ? coupon.code : "", JSON.stringify(a), method, method === "COD" ? "pending" : "paid", at, at);

      for (const it of items) {
        db.prepare("INSERT INTO order_items(id, order_id, product_id, name, price, qty, image, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(randomId("oit"), id, it.product.id, it.product.title, it.product.price, it.qty, productImages(it.product.id)[0], it.variant);
        db.prepare("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?").run(it.qty, at, it.product.id);
        addInventory(it.product.id, -it.qty, "Order " + orderNo, user.email);
      }

      db.prepare("INSERT INTO payments(id, order_id, method, amount, status, txn_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(randomId("pay"), id, method, totals.payable, method === "COD" ? "pending" : "paid", method === "COD" ? "" : "SIM" + randomCode(10), at);

      if (coupon) db.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?").run(coupon.id);
      db.prepare("DELETE FROM cart_items WHERE user_id = ? AND saved = 0").run(user.id);
      addHistory(id, "Ordered", "Order placed successfully", user.email);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      console.error("[AAMART] Order failed:", e.message);
      return fail(res, 500, "Could not place order. Please try again.");
    }

    logActivity(db, { actor: user.email, role: "customer", action: "order_create", meta: { orderNo }, ip });
    return json(res, serializeOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)), 201);
  }

  if (seg[1] === "orders" && seg.length === 2 && method === "GET") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    return json(res, { orders: rows.map((r) => serializeOrder(r)) });
  }

  if (seg[1] === "orders" && seg.length === 3 && method === "GET") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const row = db.prepare("SELECT * FROM orders WHERE (id = ? OR order_no = ?) AND user_id = ?").get(seg[2], seg[2], user.id);
    if (!row) return fail(res, 404, "Order not found");
    return json(res, serializeOrder(row));
  }

  if (seg[1] === "orders" && seg.length === 4 && seg[3] === "cancel" && method === "POST") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const row = db.prepare("SELECT * FROM orders WHERE (id = ? OR order_no = ?) AND user_id = ?").get(seg[2], seg[2], user.id);
    if (!row) return fail(res, 404, "Order not found");
    if (["Delivered", "Cancelled"].includes(row.status)) return fail(res, 400, "This order cannot be cancelled");
    if (["Shipped", "Out for Delivery"].includes(row.status)) return fail(res, 400, "Order has already shipped and cannot be cancelled");
    db.prepare("UPDATE orders SET status = 'Cancelled', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
    for (const it of items) {
      db.prepare("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?").run(it.qty, nowIso(), it.product_id);
      addInventory(it.product_id, it.qty, "Order cancelled " + row.order_no, user.email);
    }
    addHistory(row.id, "Cancelled", "Cancelled by customer", user.email);
    logActivity(db, { actor: user.email, role: "customer", action: "order_cancel", meta: { orderNo: row.order_no }, ip });
    return json(res, serializeOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(row.id)));
  }

  // ---------------- Reviews (customer) ----------------
  if (seg[1] === "reviews" && method === "POST") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const body = await readBody(req);
    const productId = sanitizeString(body && body.productId, 80);
    const rating = clampInt(body && body.rating, 1, 5, 5);
    const title = sanitizeString(body && body.title, 100);
    const text = sanitizeString(body && body.body, 1000);
    if (!db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) return fail(res, 404, "Product not found");
    const bought = db.prepare("SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'Delivered' LIMIT 1").get(user.id, productId);
    db.prepare("INSERT INTO reviews(id, product_id, user_id, name, rating, title, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomId("rev"), productId, user.id, user.name, rating, title, text, bought ? "approved" : "pending", nowIso());
    recalcRating(productId);
    return json(res, { submitted: true, pending: !bought }, 201);
  }

  // ---------------- Admin auth ----------------
  if (seg[1] === "admin" && seg[2] === "login" && method === "POST") {
    if (!rateLimit("adminlogin:" + ip, 8, 15 * 60 * 1000)) return fail(res, 429, "Too many login attempts. Please wait 15 minutes.");
    const body = await readBody(req);
    const username = sanitizeString(body && body.username, 60).toLowerCase();
    const password = String((body && body.password) || "");
    const admin = db.prepare("SELECT * FROM admins WHERE LOWER(username) = ?").get(username);
    if (!admin || !admin.active || !verifyPassword(password, admin.password_hash)) {
      logActivity(db, { actor: username, role: "admin", action: "login_failed", ip });
      return fail(res, 401, "Invalid username or password");
    }
    const token = tokens.sign({ id: admin.id, role: admin.role, kind: "admin", username: admin.username });
    logActivity(db, { actor: admin.username, role: admin.role, action: "login", ip });
    return json(res, { token, admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
  }

  if (seg[1] === "admin" && seg[2] === "me" && method === "GET") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    return json(res, { admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
  }

  // ---------------- Admin dashboard ----------------
  if (seg[1] === "admin" && seg[2] === "stats" && method === "GET") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;
    const agg = db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(payable),0) AS revenue FROM orders WHERE status != 'Cancelled'").get();
    return json(res, {
      totalSales: agg.revenue,
      revenue: agg.revenue,
      totalOrders: agg.total,
      pendingOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('Ordered','Packed')").get().c,
      deliveredOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'Delivered'").get().c,
      cancelledOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'Cancelled'").get().c,
      products: db.prepare("SELECT COUNT(*) AS c FROM products").get().c,
      lowStock: db.prepare("SELECT COUNT(*) AS c FROM products WHERE stock > 0 AND stock <= 5").get().c,
      outOfStock: db.prepare("SELECT COUNT(*) AS c FROM products WHERE stock <= 0").get().c,
      customers: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
      pendingReviews: db.prepare("SELECT COUNT(*) AS c FROM reviews WHERE status = 'pending'").get().c,
      recentOrders: db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 6").all().map((r) => serializeOrder(r)),
    });
  }

  // ---------------- Admin products ----------------
  if (seg[1] === "admin" && seg[2] === "products") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;

    if (seg.length === 4 && method === "GET") {
      const p = db.prepare("SELECT * FROM products WHERE id = ?").get(seg[3]);
      if (!p) return fail(res, 404, "Product not found");
      return json(res, serializeProduct(p, true));
    }

    if (seg.length === 3 && method === "GET") {
      return json(res, productList({
        includeInactive: true, adminView: true,
        q: parsed.searchParams.get("q") || "",
        category: parsed.searchParams.get("category") || "",
        status: parsed.searchParams.get("status") || "",
        limit: parsed.searchParams.get("limit") || 200,
        offset: parsed.searchParams.get("offset") || 0,
        sort: "newest",
      }));
    }

    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const built = buildProduct(body);
      if (built.error) return fail(res, 400, built.error);
      const id = randomId("prd");
      const at = nowIso();
      db.prepare(`INSERT INTO products(id, title, slug, description, category_id, subcategory_id, brand_id, price, mrp, discount, stock, sku, status, featured, rating, rating_count, specs, variants, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`)
        .run(id, built.title, uniqueSlug(built.title, null), built.description, built.categoryId, built.subcategoryId, built.brandId, built.price, built.mrp, built.discount, built.stock, built.sku, built.status, built.featured, JSON.stringify(built.specs), JSON.stringify(built.variants), at, at);
      saveProductImages(id, built.images);
      saveProductVariants(id, built.variants);
      addInventory(id, built.stock, "Product created", admin.username);
      logActivity(db, { actor: admin.username, role: admin.role, action: "product_create", meta: { id, title: built.title }, ip });
      return json(res, serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id), true), 201);
    }

    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(seg[3]);
      if (!existing) return fail(res, 404, "Product not found");
      const built = buildProduct(body, existing);
      if (built.error) return fail(res, 400, built.error);
      const slug = built.title !== existing.title ? uniqueSlug(built.title, existing.id) : existing.slug;
      db.prepare(`UPDATE products SET title = ?, slug = ?, description = ?, category_id = ?, subcategory_id = ?, brand_id = ?, price = ?, mrp = ?, discount = ?, stock = ?, sku = ?, status = ?, featured = ?, specs = ?, variants = ?, updated_at = ? WHERE id = ?`)
        .run(built.title, slug, built.description, built.categoryId, built.subcategoryId, built.brandId, built.price, built.mrp, built.discount, built.stock, built.sku, built.status, built.featured, JSON.stringify(built.specs), JSON.stringify(built.variants), nowIso(), existing.id);
      if (built.images !== null) saveProductImages(existing.id, built.images);
      saveProductVariants(existing.id, built.variants);
      if (built.stock !== existing.stock) addInventory(existing.id, built.stock - existing.stock, "Stock updated", admin.username);
      logActivity(db, { actor: admin.username, role: admin.role, action: "product_update", meta: { id: existing.id }, ip });
      return json(res, serializeProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id), true));
    }

    if (seg.length === 4 && method === "DELETE") {
      const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(seg[3]);
      if (!existing) return fail(res, 404, "Product not found");
      db.prepare("DELETE FROM products WHERE id = ?").run(existing.id);
      logActivity(db, { actor: admin.username, role: admin.role, action: "product_delete", meta: { id: existing.id, title: existing.title }, ip });
      return json(res, { deleted: true });
    }

    if (seg.length === 5 && seg[4] === "toggle" && method === "POST") {
      const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(seg[3]);
      if (!existing) return fail(res, 404, "Product not found");
      const status = existing.status === "active" ? "inactive" : "active";
      db.prepare("UPDATE products SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), existing.id);
      logActivity(db, { actor: admin.username, role: admin.role, action: "product_toggle", meta: { id: existing.id, status }, ip });
      return json(res, { id: existing.id, status });
    }
  }

  if (seg[1] === "admin" && seg[2] === "products-bulk" && method === "POST") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;
    const body = await readBody(req);
    const list = body && body.products;
    if (!Array.isArray(list) || !list.length) return fail(res, 400, "Provide a products array");
    if (list.length > 500) return fail(res, 400, "Maximum 500 products per bulk upload");
    const created = [];
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      const built = buildProduct(list[i]);
      if (built.error) { errors.push({ row: i + 1, error: built.error }); continue; }
      const id = randomId("prd");
      const at = nowIso();
      try {
        db.prepare(`INSERT INTO products(id, title, slug, description, category_id, subcategory_id, brand_id, price, mrp, discount, stock, sku, status, featured, rating, rating_count, specs, variants, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`)
          .run(id, built.title, uniqueSlug(built.title, null), built.description, built.categoryId, built.subcategoryId, built.brandId, built.price, built.mrp, built.discount, built.stock, built.sku, built.status, built.featured, JSON.stringify(built.specs), JSON.stringify(built.variants), at, at);
        saveProductImages(id, built.images);
        saveProductVariants(id, built.variants);
        addInventory(id, built.stock, "Bulk product upload", admin.username);
        created.push(id);
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
      }
    }
    logActivity(db, { actor: admin.username, role: admin.role, action: "product_bulk", meta: { created: created.length, errors: errors.length }, ip });
    return json(res, { created: created.length, errors }, created.length ? 201 : 400);
  }

  if (seg[1] === "admin" && seg[2] === "upload" && method === "POST") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;
    const body = await readBody(req, 6 * 1024 * 1024);
    const result = saveUpload(body && body.data, UPLOAD_DIR);
    if (result.error) return fail(res, 400, result.error);
    logActivity(db, { actor: admin.username, role: admin.role, action: "image_upload", meta: { url: result.url }, ip });
    return json(res, { url: result.url }, 201);
  }

  // ---------------- Admin categories / brands ----------------
  if (seg[1] === "admin" && seg[2] === "categories") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") {
      return json(res, { categories: categoryTree(), flat: db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all() });
    }
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const name = sanitizeString(body && body.name, 80);
      if (!name) return fail(res, 400, "Category name is required");
      const parentId = body.parentId && db.prepare("SELECT id FROM categories WHERE id = ?").get(body.parentId) ? body.parentId : null;
      const id = randomId("cat");
      db.prepare("INSERT INTO categories(id, name, slug, icon, parent_id, sort, active) VALUES (?, ?, ?, ?, ?, ?, 1)")
        .run(id, name, slugify(name) + "-" + randomCode(3).toLowerCase(), sanitizeString(body.icon, 10), parentId, safeNumber(body.sort, 0));
      return json(res, db.prepare("SELECT * FROM categories WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(seg[3]);
      if (!existing) return fail(res, 404, "Category not found");
      db.prepare("UPDATE categories SET name = ?, icon = ?, sort = ?, active = ? WHERE id = ?")
        .run(body.name != null ? sanitizeString(body.name, 80) : existing.name, body.icon != null ? sanitizeString(body.icon, 10) : existing.icon, body.sort != null ? safeNumber(body.sort, existing.sort) : existing.sort, body.active != null ? (body.active ? 1 : 0) : existing.active, existing.id);
      return json(res, db.prepare("SELECT * FROM categories WHERE id = ?").get(existing.id));
    }
    if (seg.length === 4 && method === "DELETE") {
      db.prepare("DELETE FROM categories WHERE id = ?").run(seg[3]);
      return json(res, { deleted: true });
    }
  }

  if (seg[1] === "admin" && seg[2] === "brands") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") return json(res, { brands: db.prepare("SELECT * FROM brands ORDER BY name").all() });
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const name = sanitizeString(body && body.name, 80);
      if (!name) return fail(res, 400, "Brand name is required");
      const id = randomId("brd");
      db.prepare("INSERT INTO brands(id, name, slug, active) VALUES (?, ?, ?, 1)").run(id, name, slugify(name) + "-" + randomCode(3).toLowerCase());
      return json(res, db.prepare("SELECT * FROM brands WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "DELETE") {
      db.prepare("DELETE FROM brands WHERE id = ?").run(seg[3]);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Admin banners ----------------
  if (seg[1] === "admin" && seg[2] === "banners") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") return json(res, { banners: db.prepare("SELECT * FROM banners ORDER BY sort ASC").all() });
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const title = sanitizeString(body && body.title, 100);
      if (!title) return fail(res, 400, "Banner title is required");
      const id = randomId("ban");
      db.prepare("INSERT INTO banners(id, title, subtitle, image, link, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, title, sanitizeString(body.subtitle, 160), sanitizeString(body.image, 300), sanitizeString(body.link, 200), body.active === false ? 0 : 1, safeNumber(body.sort, 0));
      return json(res, db.prepare("SELECT * FROM banners WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const b = db.prepare("SELECT * FROM banners WHERE id = ?").get(seg[3]);
      if (!b) return fail(res, 404, "Banner not found");
      db.prepare("UPDATE banners SET title = ?, subtitle = ?, image = ?, link = ?, active = ?, sort = ? WHERE id = ?")
        .run(body.title != null ? sanitizeString(body.title, 100) : b.title, body.subtitle != null ? sanitizeString(body.subtitle, 160) : b.subtitle, body.image != null ? sanitizeString(body.image, 300) : b.image, body.link != null ? sanitizeString(body.link, 200) : b.link, body.active != null ? (body.active ? 1 : 0) : b.active, body.sort != null ? safeNumber(body.sort, b.sort) : b.sort, b.id);
      return json(res, db.prepare("SELECT * FROM banners WHERE id = ?").get(b.id));
    }
    if (seg.length === 4 && method === "DELETE") {
      db.prepare("DELETE FROM banners WHERE id = ?").run(seg[3]);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Admin coupons ----------------
  if (seg[1] === "admin" && seg[2] === "coupons") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") return json(res, { coupons: db.prepare("SELECT * FROM coupons ORDER BY code").all() });
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const code = sanitizeString(body && body.code, 30).toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return fail(res, 400, "Coupon code must be 3-30 letters/numbers");
      if (db.prepare("SELECT id FROM coupons WHERE UPPER(code) = ?").get(code)) return fail(res, 409, "Coupon code already exists");
      const value = safeNumber(body.value, 0);
      if (value <= 0) return fail(res, 400, "Coupon value must be greater than 0");
      const id = randomId("cpn");
      db.prepare("INSERT INTO coupons(id, code, type, value, min_order, max_discount, expires_at, usage_limit, used_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)")
        .run(id, code, body.type === "flat" ? "flat" : "percent", value, safeNumber(body.minOrder, 0), safeNumber(body.maxDiscount, 0), sanitizeString(body.expiresAt, 40), clampInt(body.usageLimit, 0, 1000000, 0));
      return json(res, db.prepare("SELECT * FROM coupons WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const c = db.prepare("SELECT * FROM coupons WHERE id = ?").get(seg[3]);
      if (!c) return fail(res, 404, "Coupon not found");
      db.prepare("UPDATE coupons SET value = ?, min_order = ?, max_discount = ?, expires_at = ?, usage_limit = ?, active = ? WHERE id = ?")
        .run(body.value != null ? safeNumber(body.value, c.value) : c.value, body.minOrder != null ? safeNumber(body.minOrder, c.min_order) : c.min_order, body.maxDiscount != null ? safeNumber(body.maxDiscount, c.max_discount) : c.max_discount, body.expiresAt != null ? sanitizeString(body.expiresAt, 40) : c.expires_at, body.usageLimit != null ? clampInt(body.usageLimit, 0, 1000000, c.usage_limit) : c.usage_limit, body.active != null ? (body.active ? 1 : 0) : c.active, c.id);
      return json(res, db.prepare("SELECT * FROM coupons WHERE id = ?").get(c.id));
    }
    if (seg.length === 4 && method === "DELETE") {
      db.prepare("DELETE FROM coupons WHERE id = ?").run(seg[3]);
      return json(res, { deleted: true });
    }
  }

  // ---------------- Admin orders ----------------
  if (seg[1] === "admin" && seg[2] === "orders") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") {
      const status = parsed.searchParams.get("status");
      const q = (parsed.searchParams.get("q") || "").trim().toLowerCase();
      let rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all();
      if (status) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => (r.order_no + " " + r.customer_name + " " + r.customer_phone).toLowerCase().includes(q));
      return json(res, { orders: rows.map((r) => serializeOrder(r, true)) });
    }
    if (seg.length === 5 && seg[4] === "status" && method === "PUT") {
      const body = await readBody(req);
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(seg[3]);
      if (!row) return fail(res, 404, "Order not found");
      const status = sanitizeString(body && body.status, 30);
      if (!STATUS_FLOW.includes(status) && status !== "Cancelled") return fail(res, 400, "Invalid order status");
      if (row.status === "Delivered" || row.status === "Cancelled") return fail(res, 400, "This order is already " + row.status);
      if (status === "Cancelled") {
        const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
        for (const it of items) {
          db.prepare("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?").run(it.qty, nowIso(), it.product_id);
          addInventory(it.product_id, it.qty, "Order cancelled " + row.order_no, admin.username);
        }
      }
      db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), row.id);
      addHistory(row.id, status, sanitizeString(body.note, 200), admin.username);
      logActivity(db, { actor: admin.username, role: admin.role, action: "order_status", meta: { orderNo: row.order_no, status }, ip });
      return json(res, serializeOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(row.id), true));
    }
  }

  // ---------------- Admin customers ----------------
  if (seg[1] === "admin" && seg[2] === "customers" && method === "GET") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    const customers = db.prepare("SELECT id, name, email, phone, created_at FROM users ORDER BY created_at DESC").all().map((u) => {
      const agg = db.prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(payable),0) AS spent FROM orders WHERE user_id = ? AND status != 'Cancelled'").get(u.id);
      return { ...u, orders: agg.orders, spent: agg.spent };
    });
    return json(res, { customers });
  }

  // ---------------- Admin reviews ----------------
  if (seg[1] === "admin" && seg[2] === "reviews") {
    const admin = requireAdmin(req, res, ["super", "manager"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") {
      const reviews = db.prepare("SELECT * FROM reviews ORDER BY created_at DESC LIMIT 300").all().map((r) => {
        const p = db.prepare("SELECT title FROM products WHERE id = ?").get(r.product_id);
        return { ...r, productTitle: p ? p.title : "" };
      });
      return json(res, { reviews });
    }
    if (seg.length === 5 && seg[4] === "moderate" && method === "POST") {
      const body = await readBody(req);
      const r = db.prepare("SELECT * FROM reviews WHERE id = ?").get(seg[3]);
      if (!r) return fail(res, 404, "Review not found");
      const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : "pending";
      db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, r.id);
      recalcRating(r.product_id);
      logActivity(db, { actor: admin.username, role: admin.role, action: "review_moderate", meta: { id: r.id, status }, ip });
      return json(res, { id: r.id, status });
    }
    if (seg.length === 4 && method === "DELETE") {
      const r = db.prepare("SELECT * FROM reviews WHERE id = ?").get(seg[3]);
      if (r) { db.prepare("DELETE FROM reviews WHERE id = ?").run(r.id); recalcRating(r.product_id); }
      return json(res, { deleted: true });
    }
  }

  // ---------------- Admin settings (super only) ----------------
  if (seg[1] === "admin" && seg[2] === "settings") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (method === "GET") return json(res, { settings: settingsObject() });
    if (method === "PUT") {
      const body = await readBody(req);
      const allowed = ["siteName", "tagline", "currency", "deliveryCharge", "freeDeliveryAbove", "taxPercent", "codEnabled", "upiEnabled", "cardEnabled", "netbankingEnabled", "walletEnabled", "upiId", "supportEmail", "supportPhone", "address"];
      const upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      for (const key of allowed) if (body[key] !== undefined) upsert.run(key, String(body[key]));
      logActivity(db, { actor: admin.username, role: admin.role, action: "settings_update", ip });
      return json(res, { settings: settingsObject() });
    }
  }

  // ---------------- Admin manage admins (super only) ----------------
  if (seg[1] === "admin" && seg[2] === "admins") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    if (seg.length === 3 && method === "GET") {
      return json(res, { admins: db.prepare("SELECT id, username, name, role, active, created_at FROM admins ORDER BY created_at").all() });
    }
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const username = sanitizeString(body && body.username, 40).toLowerCase();
      const password = String((body && body.password) || "");
      const role = body.role === "super" ? "super" : "manager";
      if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return fail(res, 400, "Username must be 3-40 letters/numbers");
      if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters");
      if (db.prepare("SELECT id FROM admins WHERE LOWER(username) = ?").get(username)) return fail(res, 409, "Username already exists");
      const id = randomId("adm");
      db.prepare("INSERT INTO admins(id, username, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .run(id, username, sanitizeString(body.name, 80), hashPassword(password), role, nowIso());
      logActivity(db, { actor: admin.username, role: admin.role, action: "admin_create", meta: { username, role }, ip });
      return json(res, db.prepare("SELECT id, username, name, role, active, created_at FROM admins WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const target = db.prepare("SELECT * FROM admins WHERE id = ?").get(seg[3]);
      if (!target) return fail(res, 404, "Admin not found");
      if (target.role === "super" && target.id !== admin.id) return fail(res, 403, "Cannot modify another Super Admin");
      if (target.id === admin.id && body.active === false) return fail(res, 400, "You cannot disable your own account");
      if (body.password && String(body.password).length < 6) return fail(res, 400, "Password must be at least 6 characters");
      const passwordHash = body.password ? hashPassword(String(body.password)) : target.password_hash;
      db.prepare("UPDATE admins SET name = ?, password_hash = ?, active = ? WHERE id = ?")
        .run(body.name != null ? sanitizeString(body.name, 80) : target.name, passwordHash, body.active != null ? (body.active ? 1 : 0) : target.active, target.id);
      logActivity(db, { actor: admin.username, role: admin.role, action: "admin_update", meta: { username: target.username }, ip });
      return json(res, db.prepare("SELECT id, username, name, role, active, created_at FROM admins WHERE id = ?").get(target.id));
    }
    if (seg.length === 4 && method === "DELETE") {
      const target = db.prepare("SELECT * FROM admins WHERE id = ?").get(seg[3]);
      if (!target) return fail(res, 404, "Admin not found");
      if (target.role === "super") return fail(res, 403, "Super Admin accounts cannot be deleted");
      if (target.id === admin.id) return fail(res, 400, "You cannot delete your own account");
      db.prepare("DELETE FROM admins WHERE id = ?").run(target.id);
      logActivity(db, { actor: admin.username, role: admin.role, action: "admin_delete", meta: { username: target.username }, ip });
      return json(res, { deleted: true });
    }
  }

  // ---------------- Admin activity logs (super only) ----------------
  if (seg[1] === "admin" && seg[2] === "logs" && method === "GET") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    return json(res, { logs: db.prepare("SELECT * FROM activity_logs ORDER BY at DESC LIMIT 300").all() });
  }

  // ---------------- Admin inventory (super only) ----------------
  if (seg[1] === "admin" && seg[2] === "inventory" && method === "GET") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    return json(res, { inventory: db.prepare("SELECT i.*, p.title FROM inventory i LEFT JOIN products p ON p.id = i.product_id ORDER BY i.at DESC LIMIT 200").all() });
  }

  return fail(res, 404, "API route not found");
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const ADMIN_PAGES = new Set(["/admin/amirhamza", "/admin/aditism", "/admin/products"]);

const server = http.createServer(async (req, res) => {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://" + (req.headers.host || "localhost")).pathname);
  } catch {
    return fail(res, 400, "Bad request");
  }

  if (req.method === "OPTIONS") return send(res, 204, "");

  const cookies = parseCookies(req);
  if (!cookies.csrf || !/^[A-Za-z0-9_-]{20,}$/.test(cookies.csrf)) {
    const csrf = crypto.randomBytes(24).toString("base64url");
    res.setHeader("Set-Cookie", "csrf=" + csrf + "; Path=/; SameSite=Strict; Max-Age=86400");
  }

  try {
    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname, new URL(req.url, "http://" + (req.headers.host || "localhost")));
    }

    if (pathname.startsWith("/uploads/")) {
      return serveFile(res, UPLOAD_DIR, pathname.slice("/uploads".length));
    }

    if (pathname === "/admin" || pathname === "/admin/") {
      return serveFile(res, PUBLIC_DIR, "/admin-login.html");
    }
    if (ADMIN_PAGES.has(pathname)) {
      return serveFile(res, PUBLIC_DIR, "/admin.html");
    }

    return serveFile(res, PUBLIC_DIR, pathname, { fallback: "/index.html" });
  } catch (e) {
    console.error("[AAMART] Request error:", e);
    return fail(res, 500, "Server error");
  }
});

server.listen(PORT, () => {
  const line = "-".repeat(54);
  console.log("");
  console.log("  AAMART is running");
  console.log("  " + line);
  console.log("  Storefront      : http://localhost:" + PORT + "/");
  console.log("  Admin login     : http://localhost:" + PORT + "/admin");
  console.log("  Super Admin     : http://localhost:" + PORT + "/admin/amirhamza");
  console.log("  Manager Admin   : http://localhost:" + PORT + "/admin/aditism");
  console.log("  Product Control : http://localhost:" + PORT + "/admin/products");
  console.log("  " + line);
  console.log("  Super Admin     : amirhamza / akib@123");
  console.log("  Manager Admin   : aditism / aditi@123");
  console.log("  Test Customer   : test@aamart.in / test@123");
  console.log("  " + line);
  console.log("  Database        : data/aamart.db (SQLite)");
  console.log("");
});

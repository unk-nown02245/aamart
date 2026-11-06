"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const { openDatabase, jsonParse, logActivity } = require("./lib/db");
const {
  loadSecret,
  hashPassword,
  verifyPassword,
  validatePassword,
  generatePassword,
  hashOtp,
  createTokenManager,
  randomId,
  randomCode,
  otp,
  slugify,
  constantTimeEqual,
} = require("./lib/security");
const { emailConfigured, otpDebugEnabled, sendMail } = require("./lib/mailer");
const cloud = require("./lib/cloud");

const PORT = Number(process.env.PORT) || 4000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let SECRET;
let tokens;
let db;

const STATUS_FLOW = ["Ordered", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const PAYMENT_METHODS = { COD: "codEnabled", UPI: "upiEnabled", Card: "cardEnabled", "Net Banking": "netbankingEnabled", Wallet: "walletEnabled" };
const ONLINE_PAYMENTS_ENABLED = process.env.AAMART_ONLINE_PAYMENTS === "1";
const TRUST_PROXY = process.env.AAMART_TRUST_PROXY === "1";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESET_TTL_MS = 10 * 60 * 1000;
const otpStore = new Map();
const lastOtpSent = new Map();
const DUMMY_HASH = hashPassword(generatePassword(24));

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
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(self), microphone=(), camera=(), payment=()",
  "X-XSS-Protection": "0",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://nominatim.openstreetmap.org",
    "manifest-src 'self'",
  ].join("; "),
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
      if (opts.fallback) return serveFile(res, baseDir, opts.fallback, { ...opts, fallback: null, status: 404 });
      return fail(res, 404, "Not found");
    }
    const ext = path.extname(resolved).toLowerCase();
    const isHtml = ext === ".html";
    const cache = isHtml
      ? { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" }
      : [".css", ".js"].includes(ext)
        ? { "Cache-Control": "public, max-age=300, must-revalidate" }
        : { "Cache-Control": "public, max-age=86400" };
    const compressible = [".html", ".css", ".js", ".json", ".svg", ".txt", ".xml", ".webmanifest"].includes(ext);
    const accept = String((res.req && res.req.headers && res.req.headers["accept-encoding"]) || "");
    const useGzip = compressible && /\bgzip\b/i.test(accept) && stat.size > 1024;
    const headers = {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[ext] || "application/octet-stream",
      ...cache,
    };
    if (useGzip) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
    } else {
      headers["Content-Length"] = stat.size;
    }
    res.writeHead(opts.status || 200, headers);
    const stream = fs.createReadStream(resolved);
    stream.on("error", () => {
      if (!res.headersSent) fail(res, 500, "Could not read file");
      else res.destroy();
    });
    if (useGzip) stream.pipe(zlib.createGzip()).pipe(res);
    else stream.pipe(res);
  });
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
    const real = String(req.headers["x-real-ip"] || "").trim();
    if (real) return real;
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
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
  if (!user || Number(payload.tv || 0) !== Number(user.token_version || 0)) {
    fail(res, 401, "Session expired. Please login again.");
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
  if (!admin || Number(payload.tv || 0) !== Number(admin.token_version || 0)) {
    fail(res, 401, "Admin session expired. Please login again.");
    return null;
  }
  if (roles && roles.length && !roles.includes(admin.role)) {
    fail(res, 403, "You do not have permission for this action");
    return null;
  }
  return admin;
}

function sanitizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    emailVerified: Number(u.email_verified == null ? 1 : u.email_verified) === 1,
    createdAt: u.created_at,
  };
}

async function deliverOtp(email, code, reset, purpose) {
  const isVerify = purpose === "register";
  const label = isVerify ? "verification" : reset ? "password reset" : "login";
  if (otpDebugEnabled()) {
    console.log("[AAMART][OTP DEBUG] " + label + " OTP for " + email + " -> " + code);
  }
  if (!emailConfigured()) return { ok: otpDebugEnabled() };
  const subject = isVerify ? "Verify your Aamart email" : reset ? "Aamart password reset code" : "Aamart login code";
  const intro = isVerify ? "Your Aamart verification code is " : reset ? "Your Aamart password reset code is " : "Your Aamart login code is ";
  const result = await sendMail({
    to: email,
    subject,
    text: intro + code +
      ". It expires in " + (reset ? "10" : "5") + " minutes. If you did not request this, ignore this email.",
  });
  if (!result.ok) console.error("[AAMART] OTP email failed for " + email + ": " + result.error);
  return result;
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
      UPI: ONLINE_PAYMENTS_ENABLED && s.upiEnabled === "1",
      Card: ONLINE_PAYMENTS_ENABLED && s.cardEnabled === "1",
      "Net Banking": ONLINE_PAYMENTS_ENABLED && s.netbankingEnabled === "1",
      Wallet: ONLINE_PAYMENTS_ENABLED && s.walletEnabled === "1",
    },
    onlinePaymentsEnabled: ONLINE_PAYMENTS_ENABLED,
    otpLoginEnabled: emailConfigured() || otpDebugEnabled(),
    upiId: ONLINE_PAYMENTS_ENABLED ? s.upiId || "" : "",
    supportEmail: s.supportEmail || "",
    supportPhone: s.supportPhone || "",
    address: s.address || "",
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

function resolveVariant(productId, variant) {
  if (!variant) return null;
  return db.prepare("SELECT * FROM product_variants WHERE product_id = ? AND value = ? LIMIT 1").get(productId, String(variant));
}

function variantPrice(product, variantRow) {
  return variantRow && variantRow.price != null ? Number(variantRow.price) : Number(product.price);
}

function variantStock(product, variantRow) {
  return variantRow && variantRow.stock != null ? Number(variantRow.stock) : Number(product.stock);
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
  const page = clampInt(f.page, 1, 100000, 1);
  const offset = f.offset != null && f.offset !== ""
    ? clampInt(f.offset, 0, 1000000, 0)
    : (page - 1) * limit;
  const whereSql = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = db.prepare("SELECT COUNT(*) AS c FROM products" + whereSql).get(...params).c;
  const rows = db.prepare("SELECT * FROM products" + whereSql + " ORDER BY " + order + " LIMIT ? OFFSET ?").all(...params, limit, offset);
  return { products: rows.map((r) => serializeProduct(r, f.adminView)), total };
}

function categoryTree(includeEmpty) {
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
      id: p.id, name: p.name, slug: p.slug, icon: p.icon, image: p.image || "", count,
      subs: subs.map((s) => ({ id: s.id, name: s.name, slug: s.slug, image: s.image || "", count: counts[s.id] || 0 })),
    };
  }).filter((p) => includeEmpty || p.count > 0)
    .map((p) => ({ ...p, subs: includeEmpty ? p.subs : p.subs.filter((s) => s.count > 0) }));
}

// ---------------------------------------------------------------------------
// Coupons / totals
// ---------------------------------------------------------------------------
function findCoupon(code) {
  return db.prepare("SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND active = 1").get(String(code || "").trim());
}

function couponError(coupon, itemTotal, userId) {
  if (!coupon) return "Invalid coupon code";
  if (coupon.expires_at) {
    const expiry = new Date(coupon.expires_at).getTime();
    if (!Number.isFinite(expiry)) return "This coupon has an invalid expiry date";
    if (expiry < Date.now()) return "This coupon has expired";
  }
  if (coupon.usage_limit > 0 && coupon.used_count >= coupon.usage_limit) return "This coupon has reached its usage limit";
  if (itemTotal < coupon.min_order) return "Minimum order of \u20B9" + coupon.min_order + " required for this coupon";
  if (userId && db.prepare("SELECT id FROM orders WHERE user_id = ? AND UPPER(coupon_code) = UPPER(?) AND status != 'Cancelled' LIMIT 1").get(userId, coupon.code)) {
    return "You have already used this coupon";
  }
  return null;
}

function normalizeExpiry(value) {
  const raw = sanitizeString(value, 40);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function safeUrl(value, max) {
  const raw = sanitizeString(value, max || 500);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
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

function cancelOrder(row, by, note) {
  db.exec("BEGIN");
  try {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
    for (const it of items) {
      db.prepare("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?").run(it.qty, nowIso(), it.product_id);
      if (it.variant) {
        db.prepare("UPDATE product_variants SET stock = stock + ? WHERE product_id = ? AND value = ? AND stock IS NOT NULL")
          .run(it.qty, it.product_id, it.variant);
      }
      addInventory(it.product_id, it.qty, "Order cancelled " + row.order_no, by);
    }
    if (row.coupon_code) {
      db.prepare("UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE UPPER(code) = UPPER(?)").run(row.coupon_code);
    }
    const nextPayment = row.payment_status === "paid" ? "refund_pending" : "cancelled";
    db.prepare("UPDATE orders SET status = 'Cancelled', payment_status = ?, updated_at = ? WHERE id = ?").run(nextPayment, nowIso(), row.id);
    db.prepare("UPDATE payments SET status = ? WHERE order_id = ?").run(nextPayment, row.id);
    addHistory(row.id, "Cancelled", note || "Order cancelled", by);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
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
  images.slice(0, 8).forEach((url, i) => {
    const safe = safeUrl(url, 500);
    if (safe) ins.run(randomId("img"), productId, safe, i);
  });
}

function saveProductVariants(productId, variants) {
  db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(productId);
  const ins = db.prepare("INSERT INTO product_variants(id, product_id, type, value, price, stock) VALUES (?, ?, ?, ?, ?, ?)");
  (variants || []).slice(0, 30).forEach((v) => {
    const value = sanitizeString(v && v.value, 60);
    if (!value) return;
    ins.run(randomId("var"), productId, sanitizeString(v.type, 40) || "Option", value,
      safeNumber(v.price, 0) || null, v.stock == null ? null : Math.max(0, clampInt(v.stock, 0, 1000000, 0)));
  });
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
    void cloud.keepAlive();
    return json(res, { status: "ok", name: "Aamart", time: nowIso() });
  }

  // CSRF double-submit check for every state-changing request.
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isStateChanging) {
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
    const passwordError = validatePassword(password);
    if (passwordError) return fail(res, 400, passwordError);
    const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (existing && Number(existing.email_verified) !== 0) return fail(res, 409, "This email is already registered. Please login.");
    const at = nowIso();
    let id = existing ? existing.id : randomId("usr");
    if (existing) {
      db.prepare("UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = ? WHERE id = ?")
        .run(name, phone, hashPassword(password), at, id);
    } else {
      db.prepare("INSERT INTO users(id, name, email, phone, password_hash, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'customer', ?, ?)")
        .run(id, name, email, phone, hashPassword(password), at, at);
    }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!emailConfigured() && !otpDebugEnabled()) {
      db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(nowIso(), id);
      const token = tokens.sign({ id, role: "customer", kind: "customer", tv: Number(user.token_version || 0) });
      logActivity(db, { actor: email, role: "customer", action: "register", ip });
      return json(res, { token, user: sanitizeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) }, 201);
    }
    const code = otp();
    otpStore.set(email, { hash: hashOtp(SECRET, email, code), expires: Date.now() + OTP_TTL_MS, attempts: 0, reset: false, register: true });
    const sent = await deliverOtp(email, code, false, "register");
    if (!sent.ok) return fail(res, 502, "Could not send the verification email. Please try again.");
    logActivity(db, { actor: email, role: "customer", action: "register_pending", ip });
    return json(res, { pending: true, email, expiresIn: Math.floor(OTP_TTL_MS / 1000), message: "Verification OTP sent." }, 201);
  }

  if (seg[1] === "auth" && seg[2] === "login" && method === "POST") {
    if (!rateLimit("login:" + ip, 15, 15 * 60 * 1000)) return fail(res, 429, "Too many login attempts. Please wait 15 minutes.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const password = String((body && body.password) || "");
    if (!rateLimit("login-email:" + ip + ":" + email, 8, 15 * 60 * 1000)) return fail(res, 429, "Too many login attempts. Please wait 15 minutes.");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return fail(res, 401, "Invalid email or password");
    if (Number(user.email_verified) === 0) return fail(res, 403, "Please verify your email first. Use Login with OTP to verify.");
    const token = tokens.sign({ id: user.id, role: "customer", kind: "customer", tv: Number(user.token_version || 0) });
    logActivity(db, { actor: user.email, role: "customer", action: "login", ip });
    return json(res, { token, user: sanitizeUser(user) });
  }

  if (seg[1] === "auth" && seg[2] === "logout" && method === "POST") {
    const payload = getUserFromToken(req);
    if (payload && payload.kind === "customer") {
      db.prepare("UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?").run(nowIso(), payload.id);
    }
    return json(res, { loggedOut: true });
  }

  if (seg[1] === "auth" && seg[2] === "me" && method === "GET") {
    const user = requireCustomer(req, res);
    if (!user) return;
    const token = tokens.sign({ id: user.id, role: "customer", kind: "customer", tv: Number(user.token_version || 0) });
    return json(res, { user: sanitizeUser(user), token });
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
    let token = null;
    if (body.password) {
      const passwordError = validatePassword(String(body.password));
      if (passwordError) return fail(res, 400, passwordError);
      if (!verifyPassword(String(body.currentPassword || ""), user.password_hash)) return fail(res, 400, "Current password is incorrect");
      passwordHash = hashPassword(String(body.password));
    }
    db.prepare("UPDATE users SET name = ?, phone = ?, password_hash = ?, token_version = token_version + ?, updated_at = ? WHERE id = ?")
      .run(name, phone, passwordHash, body.password ? 1 : 0, nowIso(), user.id);
    if (body.password) {
      const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      token = tokens.sign({ id: fresh.id, role: "customer", kind: "customer", tv: Number(fresh.token_version || 0) });
    }
    logActivity(db, { actor: user.email, role: "customer", action: "profile_update", ip });
    return json(res, { user: sanitizeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)), ...(token ? { token } : {}) });
  }

  if (seg[1] === "auth" && seg[2] === "send-otp" && method === "POST") {
    if (!emailConfigured() && !otpDebugEnabled()) return fail(res, 503, "OTP login is not configured. Please use your password.");
    if (!rateLimit("otp:" + ip, 8, 10 * 60 * 1000)) return fail(res, 429, "Too many OTP requests. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    if (!isEmail(email)) return fail(res, 400, "Please enter a valid email address");
    if (!rateLimit("otp-email:" + ip + ":" + email, 3, 10 * 60 * 1000)) return fail(res, 429, "Too many OTP requests. Try later.");
    if (Date.now() - (lastOtpSent.get("login:" + email) || 0) < 30 * 1000) return fail(res, 429, "Please wait 30 seconds before requesting a new OTP");
    lastOtpSent.set("login:" + email, Date.now());
    const user = db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(email);
    if (user) {
      const code = otp();
      otpStore.set(email, { hash: hashOtp(SECRET, email, code), expires: Date.now() + OTP_TTL_MS, attempts: 0, reset: false });
      await deliverOtp(email, code, false, Number(user.email_verified) === 0 ? "register" : undefined);
    }
    return json(res, { sent: true, expiresIn: Math.floor(OTP_TTL_MS / 1000), message: "If an account exists, an OTP has been sent." });
  }

  if (seg[1] === "auth" && seg[2] === "verify-otp" && method === "POST") {
    if (!rateLimit("verify-otp:" + ip, 15, 10 * 60 * 1000)) return fail(res, 429, "Too many attempts. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const code = sanitizeString(body && body.otp, 12);
    if (!isEmail(email) || !/^\d{6}$/.test(code)) return fail(res, 400, "Invalid OTP");
    const rec = otpStore.get(email);
    if (!rec || rec.reset) return fail(res, 400, "OTP was not requested or has expired");
    if (rec.expires < Date.now()) { otpStore.delete(email); return fail(res, 400, "OTP expired. Please resend."); }
    rec.attempts++;
    if (rec.attempts > 5) { otpStore.delete(email); return fail(res, 429, "Too many incorrect attempts. Request a new OTP."); }
    if (!constantTimeEqual(hashOtp(SECRET, email, code), rec.hash)) return fail(res, 400, "Incorrect OTP");
    otpStore.delete(email);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) return fail(res, 400, "OTP was not requested or has expired");
    if (Number(user.email_verified) === 0) {
      db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(nowIso(), user.id);
    }
    const fresh = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const token = tokens.sign({ id: fresh.id, role: "customer", kind: "customer", tv: Number(fresh.token_version || 0) });
    logActivity(db, { actor: fresh.email, role: "customer", action: rec.register ? "email_verified" : "otp_login", ip });
    return json(res, { token, user: sanitizeUser(fresh) });
  }

  if (seg[1] === "auth" && seg[2] === "forgot-password" && method === "POST") {
    if (!emailConfigured() && !otpDebugEnabled()) return fail(res, 503, "Password reset is not configured. Please contact support.");
    if (!rateLimit("forgot:" + ip, 8, 10 * 60 * 1000)) return fail(res, 429, "Too many requests. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    if (!isEmail(email)) return fail(res, 400, "Please enter a valid email address");
    if (Date.now() - (lastOtpSent.get("reset:" + email) || 0) < 60 * 1000) return fail(res, 429, "Please wait 60 seconds before requesting a new OTP");
    lastOtpSent.set("reset:" + email, Date.now());
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      const code = otp();
      otpStore.set(email, { hash: hashOtp(SECRET, email, code), expires: Date.now() + OTP_RESET_TTL_MS, attempts: 0, reset: true });
      await deliverOtp(email, code, true);
    }
    return json(res, { sent: true, message: "If an account exists, a reset OTP has been sent." });
  }

  if (seg[1] === "auth" && seg[2] === "reset-password" && method === "POST") {
    if (!rateLimit("reset-password:" + ip, 15, 10 * 60 * 1000)) return fail(res, 429, "Too many attempts. Try later.");
    const body = await readBody(req);
    const email = sanitizeString(body && body.email, 120).toLowerCase();
    const code = sanitizeString(body && body.otp, 12);
    const rec = otpStore.get(email);
    if (!rec || !rec.reset) return fail(res, 400, "Reset OTP was not requested or has expired");
    if (rec.expires < Date.now()) { otpStore.delete(email); return fail(res, 400, "OTP expired. Please resend."); }
    rec.attempts++;
    if (rec.attempts > 5) { otpStore.delete(email); return fail(res, 429, "Too many incorrect attempts."); }
    if (!constantTimeEqual(hashOtp(SECRET, email, code), rec.hash)) return fail(res, 400, "Incorrect OTP");
    const passwordError = validatePassword(String(body.password || ""));
    if (passwordError) return fail(res, 400, passwordError);
    otpStore.delete(email);
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) return fail(res, 404, "Account not found");
    db.prepare("UPDATE users SET password_hash = ?, email_verified = 1, token_version = token_version + 1, updated_at = ? WHERE id = ?")
      .run(hashPassword(String(body.password)), nowIso(), user.id);
    logActivity(db, { actor: email, role: "customer", action: "password_reset", ip });
    return json(res, { reset: true });
  }

  // ---------------- Public catalog ----------------
  if (seg[1] === "settings" && method === "GET") return json(res, publicSettings());

  if (seg[1] === "categories" && method === "GET") return json(res, { categories: categoryTree(false) });

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
      page: parsed.searchParams.get("page") || 1,
      offset: parsed.searchParams.get("offset"),
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
    const payload = getUserFromToken(req);
    const userId = payload && payload.kind === "customer" ? payload.id : null;
    const err = couponError(coupon, itemTotal, userId);
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
        const v = resolveVariant(p.id, r.variant);
        const price = variantPrice(p, v);
        const stock = variantStock(p, v);
        const entry = {
          id: r.id, productId: p.id, qty: r.qty, variant: r.variant, saved: !!r.saved,
          name: p.title, price, mrp: p.mrp, image: productImages(p.id)[0],
          stock, status: p.status, lineTotal: money(price * r.qty),
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
      const v = resolveVariant(productId, variant);
      if (variant && !v) return fail(res, 400, "Selected variant is not available");
      const stock = variantStock(p, v);
      if (stock <= 0) return fail(res, 400, "This product is out of stock");
      const existing = db.prepare("SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND variant = ? AND saved = 0").get(user.id, productId, variant);
      if (existing) {
        db.prepare("UPDATE cart_items SET qty = ? WHERE id = ?").run(Math.min(20, existing.qty + qty, stock), existing.id);
      } else {
        db.prepare("INSERT INTO cart_items(id, user_id, product_id, variant, qty, saved, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
          .run(randomId("crt"), user.id, productId, variant, Math.min(qty, stock), nowIso());
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
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
        const v = resolveVariant(item.product_id, item.variant);
        const stock = p ? variantStock(p, v) : 0;
        const max = Math.max(1, Math.min(20, stock));
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
      const isDefault = body.isDefault === undefined ? existing.is_default : (body.isDefault ? 1 : 0);
      db.prepare("UPDATE addresses SET name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, type = ?, is_default = ? WHERE id = ?")
        .run(a.name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode, a.type, isDefault, existing.id);
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
    if (method !== "COD") return fail(res, 400, "Online payments are not available yet. Please choose Cash on Delivery.");
    if (setting(PAYMENT_METHODS[method], "1") !== "1") return fail(res, 400, method + " is currently unavailable");

    const cartRows = db.prepare("SELECT * FROM cart_items WHERE user_id = ? AND saved = 0").all(user.id);
    if (!cartRows.length) return fail(res, 400, "Your cart is empty");

    const items = [];
    let itemTotal = 0;
    for (const r of cartRows) {
      const p = db.prepare("SELECT * FROM products WHERE id = ?").get(r.product_id);
      if (!p || p.status !== "active") return fail(res, 400, "A product in your cart is no longer available");
      const v = resolveVariant(p.id, r.variant);
      if (r.variant && !v) return fail(res, 400, "A selected variant is no longer available. Please update your cart.");
      const price = variantPrice(p, v);
      const available = variantStock(p, v);
      if (available < r.qty) return fail(res, 400, "Only " + available + " left of " + p.title);
      itemTotal += price * r.qty;
      items.push({ product: p, qty: r.qty, variant: r.variant, variantRow: v, price });
    }

    let coupon = null;
    if (body.couponCode) {
      coupon = findCoupon(body.couponCode);
      const err = couponError(coupon, itemTotal, user.id);
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
          coupon ? coupon.code : "", JSON.stringify(a), method, "pending", at, at);

      for (const it of items) {
        db.prepare("INSERT INTO order_items(id, order_id, product_id, name, price, qty, image, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(randomId("oit"), id, it.product.id, it.product.title, it.price, it.qty, productImages(it.product.id)[0], it.variant);
        db.prepare("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?").run(it.qty, at, it.product.id);
        if (it.variantRow && it.variantRow.stock != null) {
          db.prepare("UPDATE product_variants SET stock = MAX(0, stock - ?) WHERE id = ?").run(it.qty, it.variantRow.id);
        }
        addInventory(it.product.id, -it.qty, "Order " + orderNo, user.email);
      }

      db.prepare("INSERT INTO payments(id, order_id, method, amount, status, txn_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(randomId("pay"), id, method, totals.payable, "pending", "", at);

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
    cancelOrder(row, user.email, "Cancelled by customer");
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
    if (!rateLimit("adminlogin-user:" + ip + ":" + username, 5, 15 * 60 * 1000)) return fail(res, 429, "Too many login attempts. Please wait 15 minutes.");
    const admin = db.prepare("SELECT * FROM admins WHERE LOWER(username) = ?").get(username);
    const ok = verifyPassword(password, admin ? admin.password_hash : DUMMY_HASH);
    if (!admin || !admin.active || !ok) {
      logActivity(db, { actor: username, role: "admin", action: "login_failed", ip });
      return fail(res, 401, "Invalid username or password");
    }
    const token = tokens.sign({ id: admin.id, role: admin.role, kind: "admin", username: admin.username, tv: Number(admin.token_version || 0) });
    logActivity(db, { actor: admin.username, role: admin.role, action: "login", ip });
    return json(res, { token, admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
  }

  if (seg[1] === "admin" && seg[2] === "logout" && method === "POST") {
    const payload = getUserFromToken(req);
    if (payload && payload.kind === "admin") {
      db.prepare("UPDATE admins SET token_version = token_version + 1 WHERE id = ?").run(payload.id);
    }
    return json(res, { loggedOut: true });
  }

  if (seg[1] === "admin" && seg[2] === "password" && method === "POST") {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readBody(req);
    const current = String((body && body.currentPassword) || "");
    const next = String((body && body.newPassword) || "");
    if (!verifyPassword(current, admin.password_hash)) return fail(res, 400, "Current password is incorrect");
    const passwordError = validatePassword(next);
    if (passwordError) return fail(res, 400, passwordError);
    db.prepare("UPDATE admins SET password_hash = ?, token_version = token_version + 1 WHERE id = ?")
      .run(hashPassword(next), admin.id);
    const fresh = db.prepare("SELECT * FROM admins WHERE id = ?").get(admin.id);
    const token = tokens.sign({ id: fresh.id, role: fresh.role, kind: "admin", username: fresh.username, tv: Number(fresh.token_version || 0) });
    logActivity(db, { actor: admin.username, role: admin.role, action: "admin_password_change", ip });
    return json(res, { changed: true, token, admin: { id: fresh.id, username: fresh.username, name: fresh.name, role: fresh.role } });
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
        page: parsed.searchParams.get("page") || 1,
        offset: parsed.searchParams.get("offset"),
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
      return json(res, { categories: categoryTree(true), flat: db.prepare("SELECT * FROM categories ORDER BY sort ASC, name ASC").all() });
    }
    if (seg.length === 3 && method === "POST") {
      const body = await readBody(req);
      const name = sanitizeString(body && body.name, 80);
      if (!name) return fail(res, 400, "Category name is required");
      const parentId = body.parentId && db.prepare("SELECT id FROM categories WHERE id = ?").get(body.parentId) ? body.parentId : null;
      const image = safeUrl(body.image, 500);
      if (image === null) return fail(res, 400, "Category image must be a relative path or HTTPS URL");
      const id = randomId("cat");
      db.prepare("INSERT INTO categories(id, name, slug, icon, image, parent_id, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)")
        .run(id, name, slugify(name) + "-" + randomCode(3).toLowerCase(), sanitizeString(body.icon, 10), image, parentId, safeNumber(body.sort, 0));
      return json(res, db.prepare("SELECT * FROM categories WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(seg[3]);
      if (!existing) return fail(res, 404, "Category not found");
      const image = body.image !== undefined ? safeUrl(body.image, 500) : (existing.image || "");
      if (image === null) return fail(res, 400, "Category image must be a relative path or HTTPS URL");
      db.prepare("UPDATE categories SET name = ?, icon = ?, image = ?, sort = ?, active = ? WHERE id = ?")
        .run(body.name != null ? sanitizeString(body.name, 80) : existing.name, body.icon != null ? sanitizeString(body.icon, 10) : existing.icon, image, body.sort != null ? safeNumber(body.sort, existing.sort) : existing.sort, body.active != null ? (body.active ? 1 : 0) : existing.active, existing.id);
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
      const image = safeUrl(body.image, 300);
      const link = safeUrl(body.link, 200);
      if (image === null || link === null) return fail(res, 400, "Banner image/link must be a relative path or HTTPS URL");
      const id = randomId("ban");
      db.prepare("INSERT INTO banners(id, title, subtitle, image, link, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, title, sanitizeString(body.subtitle, 160), image, link, body.active === false ? 0 : 1, safeNumber(body.sort, 0));
      return json(res, db.prepare("SELECT * FROM banners WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const b = db.prepare("SELECT * FROM banners WHERE id = ?").get(seg[3]);
      if (!b) return fail(res, 404, "Banner not found");
      const image = body.image != null ? safeUrl(body.image, 300) : b.image;
      const link = body.link != null ? safeUrl(body.link, 200) : b.link;
      if (image === null || link === null) return fail(res, 400, "Banner image/link must be a relative path or HTTPS URL");
      db.prepare("UPDATE banners SET title = ?, subtitle = ?, image = ?, link = ?, active = ?, sort = ? WHERE id = ?")
        .run(body.title != null ? sanitizeString(body.title, 100) : b.title, body.subtitle != null ? sanitizeString(body.subtitle, 160) : b.subtitle, image, link, body.active != null ? (body.active ? 1 : 0) : b.active, body.sort != null ? safeNumber(body.sort, b.sort) : b.sort, b.id);
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
      const expiresAt = normalizeExpiry(body.expiresAt);
      if (expiresAt === null) return fail(res, 400, "Invalid coupon expiry date");
      const id = randomId("cpn");
      db.prepare("INSERT INTO coupons(id, code, type, value, min_order, max_discount, expires_at, usage_limit, used_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)")
        .run(id, code, body.type === "flat" ? "flat" : "percent", value, safeNumber(body.minOrder, 0), safeNumber(body.maxDiscount, 0), expiresAt, clampInt(body.usageLimit, 0, 1000000, 0));
      return json(res, db.prepare("SELECT * FROM coupons WHERE id = ?").get(id), 201);
    }
    if (seg.length === 4 && method === "PUT") {
      const body = await readBody(req);
      const c = db.prepare("SELECT * FROM coupons WHERE id = ?").get(seg[3]);
      if (!c) return fail(res, 404, "Coupon not found");
      const expiresAt = body.expiresAt != null ? normalizeExpiry(body.expiresAt) : c.expires_at;
      if (expiresAt === null) return fail(res, 400, "Invalid coupon expiry date");
      db.prepare("UPDATE coupons SET value = ?, min_order = ?, max_discount = ?, expires_at = ?, usage_limit = ?, active = ? WHERE id = ?")
        .run(body.value != null ? safeNumber(body.value, c.value) : c.value, body.minOrder != null ? safeNumber(body.minOrder, c.min_order) : c.min_order, body.maxDiscount != null ? safeNumber(body.maxDiscount, c.max_discount) : c.max_discount, expiresAt, body.usageLimit != null ? clampInt(body.usageLimit, 0, 1000000, c.usage_limit) : c.usage_limit, body.active != null ? (body.active ? 1 : 0) : c.active, c.id);
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
        cancelOrder(row, admin.username, sanitizeString(body.note, 200) || "Cancelled by admin");
      } else {
        const currentIndex = STATUS_FLOW.indexOf(row.status);
        const nextIndex = STATUS_FLOW.indexOf(status);
        if (nextIndex !== currentIndex + 1) return fail(res, 400, "Orders can only move to the next status");
        db.prepare("UPDATE orders SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?")
          .run(status, status === "Delivered" && row.payment_method === "COD" ? "paid" : row.payment_status, nowIso(), row.id);
        if (status === "Delivered" && row.payment_method === "COD") {
          db.prepare("UPDATE payments SET status = 'paid' WHERE order_id = ?").run(row.id);
        }
        addHistory(row.id, status, sanitizeString(body.note, 200), admin.username);
      }
      logActivity(db, { actor: admin.username, role: admin.role, action: "order_status", meta: { orderNo: row.order_no, status }, ip });
      return json(res, serializeOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(row.id), true));
    }
  }

  // ---------------- Admin customers ----------------
  if (seg[1] === "admin" && seg[2] === "customers" && method === "GET") {
    const admin = requireAdmin(req, res, ["super"]);
    if (!admin) return;
    const customers = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.payable ELSE 0 END), 0) AS spent
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
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
    if (method === "GET") return json(res, { settings: settingsObject(), onlinePaymentsEnabled: ONLINE_PAYMENTS_ENABLED });
    if (method === "PUT") {
      const body = await readBody(req);
      const allowed = ["siteName", "tagline", "currency", "deliveryCharge", "freeDeliveryAbove", "taxPercent", "codEnabled", "upiEnabled", "cardEnabled", "netbankingEnabled", "walletEnabled", "upiId", "supportEmail", "supportPhone", "address"];
      const upsert = db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      const onlineKeys = ["upiEnabled", "cardEnabled", "netbankingEnabled", "walletEnabled"];
      for (const key of allowed) {
        if (body[key] === undefined) continue;
        let value = String(body[key]);
        if (!ONLINE_PAYMENTS_ENABLED && onlineKeys.includes(key)) value = "0";
        if (!ONLINE_PAYMENTS_ENABLED && key === "upiId") value = "";
        upsert.run(key, value);
      }
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
      const passwordError = validatePassword(password);
      if (passwordError) return fail(res, 400, passwordError);
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
      if (body.password) {
        const passwordError = validatePassword(String(body.password));
        if (passwordError) return fail(res, 400, passwordError);
      }
      const passwordHash = body.password ? hashPassword(String(body.password)) : target.password_hash;
      db.prepare("UPDATE admins SET name = ?, password_hash = ?, active = ?, token_version = token_version + ? WHERE id = ?")
        .run(body.name != null ? sanitizeString(body.name, 80) : target.name, passwordHash, body.active != null ? (body.active ? 1 : 0) : target.active, (body.password || body.active != null) ? 1 : 0, target.id);
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

    if (pathname === "/" || pathname === "/index.html") {
      return serveFile(res, PUBLIC_DIR, "/index.html");
    }
    if (!path.extname(pathname)) {
      return serveFile(res, PUBLIC_DIR, pathname, { fallback: "/404.html" });
    }
    return serveFile(res, PUBLIC_DIR, pathname);
  } catch (e) {
    console.error("[AAMART] Request error:", e);
    return fail(res, 500, "Server error");
  }
});

async function start() {
  await cloud.restore(ROOT);
  SECRET = loadSecret(DATA_DIR);
  tokens = createTokenManager(SECRET);
  db = openDatabase(DATA_DIR);
  cloud.attach({ db, root: ROOT });

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
    console.log("  Admin credentials: see data/ADMIN-CREDENTIALS.txt");
    console.log("  Override with AAMART_SUPER_PASSWORD / AAMART_MANAGER_PASSWORD.");
    console.log("  " + line);
    console.log("  Database        : data/aamart.db (SQLite)");
    console.log("  Cloud backup    : " + (cloud.enabled() ? "enabled" : "disabled"));
    console.log("");
  });
}

start().catch((e) => {
  console.error("[AAMART] Startup failed:", e);
  process.exit(1);
});

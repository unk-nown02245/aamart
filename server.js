const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const SECRET = process.env.AAMART_SECRET || "AAMART-change-this-secret-key";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function id() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const test = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
  } catch {
    return false;
  }
}

function signToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 12 * 3600 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expect) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

const DEFAULT_ADMIN = { username: "admin", password: "AAMART@123" };

// In-memory OTP store: email -> { otp, expires }
const otps = new Map();
function sanitizeUser(u) {
  return {
    id: u.id, name: u.name || "", firstName: u.firstName || "", lastName: u.lastName || "",
    gender: u.gender || "", email: u.email, phone: u.phone || "", createdAt: u.createdAt,
  };
}
function normEmail(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "");
}
function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
}
function getUsers() {
  return readJSON(USERS_FILE, []);
}

// Full A-to-Z category tree (main -> subcategories)
const CATEGORIES = [
  { name: "Electronics", icon: "\u{1F4F1}", subs: ["Mobiles", "Laptops", "Audio", "Cameras", "Gaming", "Tablets"] },
  { name: "Men", icon: "\u{1F455}", subs: ["T-Shirts", "Shirts", "Jeans", "Trousers", "Ethnic Wear", "Winter Wear", "Innerwear"] },
  { name: "Women", icon: "\u{1F457}", subs: ["Sarees", "Kurtis", "Tops", "Dresses", "Jeans", "Ethnic Wear", "Winter Wear"] },
  { name: "Kids", icon: "\u{1F9D2}", subs: ["Boys Clothing", "Girls Clothing", "Toys", "Baby Care", "Kids Footwear"] },
  { name: "Footwear", icon: "\u{1F45F}", subs: ["Men's Shoes", "Women's Shoes", "Sneakers", "Sandals", "Ethnic Footwear"] },
  { name: "Watches", icon: "\u{231A}", subs: ["Men's Watches", "Women's Watches", "Smart Watches", "Kids Watches"] },
  { name: "Bags & Luggage", icon: "\u{1F392}", subs: ["Backpacks", "Handbags", "Wallets", "Travel Bags"] },
  { name: "Jewellery", icon: "\u{1F48D}", subs: ["Earrings", "Necklaces", "Rings", "Bangles", "Pendants"] },
  { name: "Beauty & Health", icon: "\u{1F484}", subs: ["Makeup", "Skincare", "Haircare", "Fragrances", "Wellness"] },
  { name: "Home & Furniture", icon: "\u{1F6CB}", subs: ["Furniture", "Home Decor", "Bedsheets", "Kitchen", "Lighting"] },
  { name: "Appliances", icon: "\u{1F50C}", subs: ["Kitchen Appliances", "Large Appliances", "Fans", "Home Appliances"] },
  { name: "Grocery", icon: "\u{1F6D2}", subs: ["Snacks", "Beverages", "Staples", "Packaged Food", "Spices"] },
  { name: "Sports & Fitness", icon: "\u{1F3CB}", subs: ["Fitness Gear", "Cricket", "Football", "Cycling", "Yoga"] },
  { name: "Books & Stationery", icon: "\u{1F4DA}", subs: ["Fiction", "Exam Prep", "Self Help", "Notebooks", "Pens"] },
  { name: "Toys & Baby", icon: "\u{1F9F8}", subs: ["Toys", "Games", "Baby Gear", "Diapers", "Soft Toys"] },
  { name: "Automotive", icon: "\u{1F697}", subs: ["Car Accessories", "Bike Accessories", "Helmets", "Car Care"] },
  { name: "Pet Supplies", icon: "\u{1F415}", subs: ["Dog Food", "Cat Food", "Pet Toys", "Pet Grooming"] },
  { name: "Others", icon: "\u{1F3F7}", subs: [] },
];

function svgImg(emoji, bg) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
    '<rect width="400" height="400" fill="' + bg + '"/>' +
    '<circle cx="200" cy="200" r="135" fill="#ffffff" opacity="0.92"/>' +
    '<text x="200" y="258" font-size="150" text-anchor="middle">' + emoji + "</text>" +
    "</svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const DEFAULT_PRODUCTS = [
  {
    name: "AAMART Buds Pro Wireless Earbuds",
    category: "Electronics", sub: "Audio",
    price: 1299, mrp: 3999, rating: 4.3, stock: 34,
    image: "/img/earbuds.svg",
    description: "True wireless earbuds with 40H playtime, deep bass, ENC calling and fast USB-C charging. Perfect for music, calls and gaming.",
  },
  {
    name: "AAMART Fit Smart Watch",
    category: "Watches", sub: "Smart Watches",
    price: 1899, mrp: 5999, rating: 4.1, stock: 21,
    image: "/img/watch.svg",
    description: "1.85\" HD display smart watch with Bluetooth calling, SpO2, heart-rate, 100+ sports modes and 7-day battery life.",
  },
  {
    name: "Men's Cotton Casual Shirt",
    category: "Men", sub: "Shirts",
    price: 699, mrp: 1499, rating: 4.2, stock: 40,
    image: svgImg("\u{1F454}", "#dbe7ff"),
    description: "Slim-fit premium cotton casual shirt, full sleeve, breathable fabric. Available in multiple sizes and colours.",
  },
  {
    name: "Women's Printed Anarkali Kurta",
    category: "Women", sub: "Kurtis",
    price: 549, mrp: 1299, rating: 4.4, stock: 55,
    image: svgImg("\u{1F459}", "#ffe1ef"),
    description: "Elegant printed Anarkali kurta in soft rayon fabric. Perfect for daily wear and festive occasions.",
  },
  {
    name: "Men's Running Sneakers",
    category: "Footwear", sub: "Sneakers",
    price: 1299, mrp: 2999, rating: 4.0, stock: 30,
    image: svgImg("\u{1F45F}", "#e2f5e8"),
    description: "Lightweight breathable running sneakers with memory-foam sole and anti-slip grip. Great for gym and casual use.",
  },
  {
    name: "Cotton Double Bedsheet Set",
    category: "Home & Furniture", sub: "Bedsheets",
    price: 899, mrp: 1999, rating: 4.1, stock: 25,
    image: svgImg("\u{1F6CF}", "#fff2cc"),
    description: "King-size cotton bedsheet with 2 pillow covers. Soft, colour-fast and easy to wash. Fits standard double beds.",
  },
];

function seed() {
  if (!fs.existsSync(ADMIN_FILE)) {
    writeJSON(ADMIN_FILE, {
      username: DEFAULT_ADMIN.username,
      passwordHash: hashPassword(DEFAULT_ADMIN.password),
      createdAt: new Date().toISOString(),
    });
  }
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const admin = readJSON(ADMIN_FILE, {});
    const envUser = String(process.env.ADMIN_USERNAME).trim();
    const envPass = String(process.env.ADMIN_PASSWORD);
    if (admin.username !== envUser || !verifyPassword(envPass, admin.passwordHash || "")) {
      writeJSON(ADMIN_FILE, {
        username: envUser,
        passwordHash: hashPassword(envPass),
        createdAt: admin.createdAt || new Date().toISOString(),
      });
      console.log("[AAMART] Admin credentials updated from environment variables");
    }
  }
  if (!fs.existsSync(PRODUCTS_FILE)) {
    const now = Date.now();
    const list = DEFAULT_PRODUCTS.map((p, i) => ({
      id: id(),
      discount: Math.round(((p.mrp - p.price) / p.mrp) * 100),
      createdAt: new Date(now - i * 1000).toISOString(),
      ...p,
    }));
    writeJSON(PRODUCTS_FILE, list);
  }
  if (!fs.existsSync(ORDERS_FILE)) writeJSON(ORDERS_FILE, []);
}
seed();

function getProducts() {
  return readJSON(PRODUCTS_FILE, []);
}
function getOrders() {
  return readJSON(ORDERS_FILE, []);
}

function send(res, status, body, headers) {
  const h = headers || {};
  h["Content-Type"] = h["Content-Type"] || "application/json; charset=utf-8";
  h["Access-Control-Allow-Origin"] = "*";
  h["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  h["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  res.writeHead(status, h);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function json(res, data, status) {
  send(res, status || 200, data);
}
function error(res, status, message) {
  send(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function auth(req) {
  const header = req.headers["authorization"] || "";
  const token = header.replace(/^Bearer\s+/i, "");
  return verifyToken(token);
}
function requireAdmin(req, res) {
  const user = auth(req);
  if (!user) {
    error(res, 401, "Unauthorized. Please login to admin panel.");
    return null;
  }
  return user;
}

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
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return error(res, 403, "Forbidden");
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return error(res, 404, "Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const noCache = [".html", ".css", ".js"].includes(ext);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      ...(noCache ? { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" } : {}),
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathname = parsed.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  try {
    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname, parsed);
    }
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    return error(res, 500, "Server error: " + e.message);
  }
});

async function handleApi(req, res, pathname, parsed) {
  const method = req.method;
  const seg = pathname.split("/").filter(Boolean); // ["api", ...]

  if (seg[1] === "health" && method === "GET") {
    return json(res, { status: "ok", name: "AAMART", time: new Date().toISOString() });
  }

  // ----- AUTH -----
  if (seg[1] === "admin" && seg[2] === "login" && method === "POST") {
    const body = await readBody(req);
    if (!body) return error(res, 400, "Invalid request body");
    const admin = readJSON(ADMIN_FILE, null);
    if (!admin) return error(res, 500, "Admin not configured");
    if (body.username !== admin.username || !verifyPassword(body.password || "", admin.passwordHash)) {
      return error(res, 401, "Invalid username or password");
    }
    const token = signToken({ username: admin.username, role: "admin" });
    return json(res, { token, username: admin.username, role: "admin" });
  }

  if (seg[1] === "admin" && seg[2] === "me" && method === "GET") {
    const user = auth(req);
    if (!user) return error(res, 401, "Unauthorized");
    return json(res, { username: user.username, role: user.role });
  }

  // ----- PRODUCTS -----
  if (seg[1] === "products" && seg.length === 2 && method === "GET") {
    let list = getProducts();
    const q = (parsed.searchParams.get("q") || "").trim().toLowerCase();
    const category = (parsed.searchParams.get("category") || "").trim().toLowerCase();
    const sub = (parsed.searchParams.get("sub") || "").trim().toLowerCase();
    const sort = parsed.searchParams.get("sort") || "";
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }
    if (category && category !== "all") {
      list = list.filter((p) => (p.category || "").toLowerCase() === category);
    }
    if (sub && sub !== "all") {
      list = list.filter((p) => (p.sub || "").toLowerCase() === sub);
    }
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (sort === "rating") list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, { products: list, count: list.length });
  }

  if (seg[1] === "categories" && method === "GET") {
    const products = getProducts();
    const counts = {};
    products.forEach((p) => {
      const c = p.category || "Others";
      counts[c] = (counts[c] || 0) + 1;
    });
    const known = CATEGORIES.map((c) => ({
      name: c.name, icon: c.icon, subs: c.subs, count: counts[c.name] || 0,
    }));
    const extra = Object.keys(counts)
      .filter((c) => !CATEGORIES.some((x) => x.name === c))
      .map((c) => ({ name: c, icon: "\u{1F3F7}", subs: [], count: counts[c] }));
    return json(res, { categories: known.concat(extra) });
  }

  if (seg[1] === "products" && seg.length === 3 && method === "GET") {
    const p = getProducts().find((x) => x.id === seg[2]);
    if (!p) return error(res, 404, "Product not found");
    return json(res, p);
  }

  if (seg[1] === "products" && seg.length === 2 && method === "POST") {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!body || !body.name) return error(res, 400, "Product name is required");
    const mrp = Number(body.mrp) || Number(body.price) || 0;
    const price = Number(body.price) || 0;
    const product = {
      id: id(),
      name: String(body.name).trim(),
      category: (body.category || "Others").trim(),
      sub: (body.sub || "").trim(),
      price,
      mrp,
      discount: mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0,
      rating: Number(body.rating) || 0,
      stock: Number(body.stock) || 0,
      image: body.image || "",
      description: (body.description || "").trim(),
      createdAt: new Date().toISOString(),
    };
    const list = getProducts();
    list.unshift(product);
    writeJSON(PRODUCTS_FILE, list);
    return json(res, product, 201);
  }

  if (seg[1] === "products" && seg.length === 3 && (method === "PUT" || method === "DELETE")) {
    const user = requireAdmin(req, res);
    if (!user) return;
    const list = getProducts();
    const idx = list.findIndex((x) => x.id === seg[2]);
    if (idx < 0) return error(res, 404, "Product not found");
    if (method === "DELETE") {
      const removed = list.splice(idx, 1)[0];
      writeJSON(PRODUCTS_FILE, list);
      return json(res, { deleted: true, product: removed });
    }
    const body = await readBody(req);
    if (!body) return error(res, 400, "Invalid body");
    const cur = list[idx];
    const price = body.price !== undefined ? Number(body.price) : cur.price;
    const mrp = body.mrp !== undefined ? Number(body.mrp) : cur.mrp;
    const updated = {
      ...cur,
      name: body.name !== undefined ? String(body.name).trim() : cur.name,
      category: body.category !== undefined ? String(body.category).trim() : cur.category,
      sub: body.sub !== undefined ? String(body.sub).trim() : cur.sub,
      price,
      mrp,
      discount: mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0,
      rating: body.rating !== undefined ? Number(body.rating) : cur.rating,
      stock: body.stock !== undefined ? Number(body.stock) : cur.stock,
      image: body.image !== undefined ? body.image : cur.image,
      description: body.description !== undefined ? String(body.description).trim() : cur.description,
    };
    list[idx] = updated;
    writeJSON(PRODUCTS_FILE, list);
    return json(res, updated);
  }

  // ----- CUSTOMER AUTH -----
  if (seg[1] === "auth" && seg[2] === "check" && method === "POST") {
    const body = await readBody(req);
    const email = normEmail(body && body.email);
    if (!email) return error(res, 400, "Email is required");
    const u = getUsers().find((x) => x.email === email);
    return json(res, { exists: !!u, hasPassword: !!(u && u.passwordHash), name: u ? u.name : "" });
  }

  if (seg[1] === "auth" && seg[2] === "send-otp" && method === "POST") {
    const body = await readBody(req);
    const email = normEmail(body && body.email);
    if (!validEmail(email)) return error(res, 400, "Please enter a valid email address (example: name@gmail.com)");
    const u = getUsers().find((x) => x.email === email);
    if (u && u.passwordHash) return error(res, 400, "This email is already registered. Please login with your password.");
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otps.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });
    console.log("[AAMART] OTP for " + email + " is " + otp);
    return json(res, { sent: true, demo: otp, expiresIn: 300 });
  }

  if (seg[1] === "auth" && seg[2] === "verify-otp" && method === "POST") {
    const body = await readBody(req);
    const email = normEmail(body && body.email);
    const rec = otps.get(email);
    if (!rec) return error(res, 400, "OTP was not requested or has expired.");
    if (rec.expires < Date.now()) { otps.delete(email); return error(res, 400, "OTP has expired. Please resend."); }
    if (String((body && body.otp) || "") !== rec.otp) return error(res, 400, "Incorrect OTP. Please try again.");
    otps.delete(email);
    const signupToken = signToken({ email, stage: "signup" });
    return json(res, { signupToken });
  }

  if (seg[1] === "auth" && seg[2] === "complete" && method === "POST") {
    const body = await readBody(req);
    const payload = verifyToken((body && body.signupToken) || "");
    if (!payload || payload.stage !== "signup") return error(res, 401, "Signup session expired. Please start again.");
    const email = payload.email;
    const name = String((body && body.name) || "").trim();
    const phone = String((body && body.phone) || "").trim();
    const password = String((body && body.password) || "");
    if (!name) return error(res, 400, "Please enter your full name");
    if (!/^[0-9]{10}$/.test(phone.replace(/\D/g, "").slice(-10)) || phone.replace(/\D/g, "").length < 10) {
      return error(res, 400, "Please enter a valid 10-digit mobile number");
    }
    if (password.length < 4) return error(res, 400, "Password must be at least 4 characters");
    const users = getUsers();
    let u = users.find((x) => x.email === email);
    if (!u) { u = { id: id(), email, createdAt: new Date().toISOString() }; users.push(u); }
    u.name = name;
    u.firstName = String((body && body.firstName) || "").trim() || name.split(" ")[0] || "";
    u.lastName = String((body && body.lastName) || "").trim() || name.split(" ").slice(1).join(" ") || "";
    u.gender = String((body && body.gender) || "").trim();
    u.phone = phone;
    u.passwordHash = hashPassword(password);
    u.verified = true;
    writeJSON(USERS_FILE, users);
    const token = signToken({ email, role: "customer" });
    return json(res, { token, user: sanitizeUser(u) });
  }

  if (seg[1] === "auth" && seg[2] === "login" && method === "POST") {
    const body = await readBody(req);
    const email = normEmail(body && body.email);
    const u = getUsers().find((x) => x.email === email);
    if (!u || !u.passwordHash) return error(res, 401, "No account found for this email. Please sign up.");
    if (!verifyPassword(String((body && body.password) || ""), u.passwordHash)) return error(res, 401, "Incorrect password");
    const token = signToken({ email, role: "customer" });
    return json(res, { token, user: sanitizeUser(u) });
  }

  if (seg[1] === "auth" && seg[2] === "me" && method === "GET") {
    const payload = auth(req);
    if (!payload || payload.role !== "customer") return error(res, 401, "Not logged in");
    const u = getUsers().find((x) => x.email === payload.email);
    if (!u) return error(res, 401, "Account not found");
    return json(res, { user: sanitizeUser(u) });
  }

  if (seg[1] === "auth" && seg[2] === "update" && method === "PUT") {
    const payload = auth(req);
    if (!payload || payload.role !== "customer") return error(res, 401, "Not logged in");
    const body = await readBody(req);
    const users = getUsers();
    const u = users.find((x) => x.email === payload.email);
    if (!u) return error(res, 404, "Account not found");
    if (body && body.firstName !== undefined) u.firstName = String(body.firstName).trim();
    if (body && body.lastName !== undefined) u.lastName = String(body.lastName).trim();
    if (body && body.gender !== undefined) u.gender = String(body.gender).trim();
    if (body && body.phone) u.phone = String(body.phone).trim();
    if (body && body.name) u.name = String(body.name).trim();
    else if (u.firstName || u.lastName) u.name = (u.firstName + " " + u.lastName).trim();
    if (body && body.password) {
      if (String(body.password).length < 4) return error(res, 400, "Password must be at least 4 characters");
      u.passwordHash = hashPassword(String(body.password));
    }
    writeJSON(USERS_FILE, users);
    return json(res, { user: sanitizeUser(u) });
  }

  // ----- ORDERS -----
  if (seg[1] === "orders" && seg.length === 2 && method === "POST") {
    const body = await readBody(req);
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return error(res, 400, "Cart is empty");
    }
    const products = getProducts();
    let total = 0;
    const items = body.items.map((it) => {
      const p = products.find((x) => x.id === it.id);
      const price = p ? p.price : Number(it.price) || 0;
      const qty = Math.max(1, Number(it.qty) || 1);
      total += price * qty;
      return { id: it.id, name: p ? p.name : it.name || "Item", price, qty };
    });
    const order = {
      id: "ORD-" + id().toUpperCase().slice(0, 8),
      items,
      total,
      payment: "COD",
      customer: {
        name: (body.customer && body.customer.name) || "",
        phone: (body.customer && body.customer.phone) || "",
        address: (body.customer && body.customer.address) || "",
      },
      status: "Placed",
      createdAt: new Date().toISOString(),
    };
    const orders = getOrders();
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);
    return json(res, order, 201);
  }

  if (seg[1] === "orders" && seg.length === 2 && method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return;
    return json(res, { orders: getOrders() });
  }

  if (seg[1] === "orders" && seg.length === 3 && method === "PUT") {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readBody(req);
    const orders = getOrders();
    const idx = orders.findIndex((x) => x.id === seg[2]);
    if (idx < 0) return error(res, 404, "Order not found");
    orders[idx].status = (body && body.status) || orders[idx].status;
    writeJSON(ORDERS_FILE, orders);
    return json(res, orders[idx]);
  }

  // ----- STATS -----
  if (seg[1] === "stats" && method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return;
    const products = getProducts();
    const orders = getOrders();
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    return json(res, {
      products: products.length,
      orders: orders.length,
      revenue,
      outOfStock: products.filter((p) => (p.stock || 0) <= 0).length,
    });
  }

  return error(res, 404, "API route not found: " + pathname);
}

server.listen(PORT, () => {
  console.log("");
  console.log("  AAMART server is running!");
  console.log("  ------------------------------------------");
  console.log("  Store    :  http://localhost:" + PORT + "/");
  console.log("  Admin    :  http://localhost:" + PORT + "/admin.html");
  console.log("  Health   :  http://localhost:" + PORT + "/api/health");
  console.log("  ------------------------------------------");
  console.log("  Admin login  ->  username: admin   password: AAMART@123");
  console.log("");
});

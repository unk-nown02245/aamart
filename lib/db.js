"use strict";

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
const { hashPassword, randomId, slugify } = require("./security");

const CATEGORY_TREE = [
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

const SEED_PRODUCTS = [
  {
    title: "Aamart Buds Pro Wireless Earbuds",
    category: "Electronics", sub: "Audio", brand: "Aamart",
    price: 1299, mrp: 3999, stock: 34, rating: 4.3, ratingCount: 128, featured: 1,
    image: "/img/earbuds.svg",
    description: "True wireless earbuds with 40H total playtime, deep bass drivers, ENC calling and fast USB-C charging. IPX5 sweat resistant, perfect for music, calls and gaming.",
    specs: { Driver: "13mm dynamic", Playtime: "40 hours with case", Bluetooth: "v5.3", Charging: "USB-C fast charge", WaterResistance: "IPX5" },
    variants: [{ type: "Color", value: "Midnight Black", price: 1299 }, { type: "Color", value: "Pearl White", price: 1299 }],
  },
  {
    title: "Aamart Fit Smart Watch",
    category: "Watches", sub: "Smart Watches", brand: "Aamart",
    price: 1899, mrp: 5999, stock: 21, rating: 4.1, ratingCount: 94, featured: 1,
    image: "/img/watch.svg",
    description: "1.85 inch HD display smart watch with Bluetooth calling, SpO2, heart-rate monitoring, 100+ sports modes and 7-day battery life.",
    specs: { Display: "1.85\" HD", Battery: "7 days", Calling: "Bluetooth", Sensors: "SpO2, Heart rate", WaterResistance: "IP68" },
    variants: [{ type: "Color", value: "Jet Black", price: 1899 }, { type: "Color", value: "Ocean Blue", price: 1999 }],
  },
  {
    title: "Men's Cotton Casual Shirt",
    category: "Men", sub: "Shirts", brand: "StyleHub",
    price: 699, mrp: 1499, stock: 40, rating: 4.2, ratingCount: 212, featured: 0,
    image: "/img/shirt.svg",
    description: "Slim-fit premium cotton casual shirt with full sleeves and breathable fabric. A versatile pick for office, outings and everyday wear.",
    specs: { Fabric: "100% Cotton", Fit: "Slim fit", Sleeve: "Full sleeve", Wash: "Machine wash" },
    variants: [{ type: "Size", value: "M", price: 699 }, { type: "Size", value: "L", price: 699 }, { type: "Size", value: "XL", price: 729 }],
  },
  {
    title: "Women's Printed Anarkali Kurta",
    category: "Women", sub: "Kurtis", brand: "StyleHub",
    price: 549, mrp: 1299, stock: 55, rating: 4.4, ratingCount: 176, featured: 1,
    image: "/img/kurta.svg",
    description: "Elegant printed Anarkali kurta in soft rayon fabric with a flattering flare. Perfect for daily wear and festive occasions.",
    specs: { Fabric: "Rayon", Length: "Calf length", Pattern: "Floral print", Wash: "Hand wash" },
    variants: [{ type: "Size", value: "S", price: 549 }, { type: "Size", value: "M", price: 549 }, { type: "Size", value: "L", price: 579 }],
  },
  {
    title: "Men's Running Sneakers",
    category: "Footwear", sub: "Sneakers", brand: "Aamart Essentials",
    price: 1299, mrp: 2999, stock: 30, rating: 4.0, ratingCount: 143, featured: 0,
    image: "/img/sneakers.svg",
    description: "Lightweight breathable running sneakers with memory-foam sole and anti-slip grip. Great for gym, running and casual use.",
    specs: { Sole: "Memory foam", Upper: "Mesh", Closure: "Lace-up", Ideal: "Running & gym" },
    variants: [{ type: "Size", value: "UK 7", price: 1299 }, { type: "Size", value: "UK 8", price: 1299 }, { type: "Size", value: "UK 9", price: 1299 }],
  },
  {
    title: "Cotton Double Bedsheet Set",
    category: "Home & Furniture", sub: "Bedsheets", brand: "HomeNest",
    price: 899, mrp: 1999, stock: 25, rating: 4.1, ratingCount: 88, featured: 0,
    image: "/img/bedsheet.svg",
    description: "King-size cotton bedsheet with 2 matching pillow covers. Soft, colour-fast and easy to wash. Fits standard double beds.",
    specs: { Material: "Cotton", Size: "King", Includes: "1 bedsheet + 2 pillow covers", ThreadCount: "210 TC" },
    variants: [],
  },
  {
    title: "5G Smartphone 8GB + 128GB",
    category: "Electronics", sub: "Mobiles", brand: "TechPro",
    price: 12999, mrp: 17999, stock: 14, rating: 4.2, ratingCount: 301, featured: 1,
    image: "/img/phone.svg",
    description: "Powerful 5G smartphone with 6.6 inch 120Hz display, 50MP triple camera, 5000mAh battery and 33W fast charging.",
    specs: { Display: "6.6\" 120Hz", Camera: "50MP triple", Battery: "5000mAh", RAM: "8GB", Storage: "128GB" },
    variants: [{ type: "Color", value: "Graphite", price: 12999 }, { type: "Color", value: "Sky Blue", price: 12999 }],
  },
  {
    title: "UltraBook 14 Laptop i5 16GB",
    category: "Electronics", sub: "Laptops", brand: "TechPro",
    price: 48990, mrp: 62990, stock: 8, rating: 4.5, ratingCount: 67, featured: 1,
    image: "/img/laptop.svg",
    description: "Thin and light 14 inch laptop with Intel Core i5, 16GB RAM, 512GB SSD and all-day battery. Ideal for work and study.",
    specs: { Processor: "Intel Core i5", RAM: "16GB", Storage: "512GB SSD", Display: "14\" FHD" },
    variants: [],
  },
  {
    title: "Over-Ear Bluetooth Headphones",
    category: "Electronics", sub: "Audio", brand: "Aamart",
    price: 1499, mrp: 3499, stock: 27, rating: 4.3, ratingCount: 154, featured: 0,
    image: "/img/headphones.svg",
    description: "Comfortable over-ear headphones with active noise cancellation, 60H battery and crystal-clear sound.",
    specs: { Type: "Over-ear", ANC: "Yes", Battery: "60 hours", Bluetooth: "v5.2" },
    variants: [{ type: "Color", value: "Black", price: 1499 }],
  },
  {
    title: "Women's Leather Handbag",
    category: "Bags & Luggage", sub: "Handbags", brand: "StyleHub",
    price: 1099, mrp: 2499, stock: 18, rating: 4.2, ratingCount: 73, featured: 0,
    image: "/img/bag.svg",
    description: "Stylish vegan-leather handbag with spacious compartments, durable stitching and a detachable shoulder strap.",
    specs: { Material: "Vegan leather", Compartments: "3", Strap: "Detachable" },
    variants: [{ type: "Color", value: "Tan", price: 1099 }, { type: "Color", value: "Black", price: 1099 }],
  },
  {
    title: "Matte Liquid Lipstick Set",
    category: "Beauty & Health", sub: "Makeup", brand: "Aamart Essentials",
    price: 449, mrp: 999, stock: 60, rating: 4.0, ratingCount: 119, featured: 0,
    image: "/img/lipstick.svg",
    description: "Set of 4 long-lasting matte liquid lipsticks with rich pigment, transfer-resistant finish and comfortable wear.",
    specs: { Shades: "4", Finish: "Matte", Lasting: "Up to 12 hours" },
    variants: [],
  },
  {
    title: "Kids Building Blocks 250 Pcs",
    category: "Toys & Baby", sub: "Toys", brand: "Generic",
    price: 599, mrp: 1299, stock: 42, rating: 4.4, ratingCount: 96, featured: 0,
    image: "/img/toy.svg",
    description: "Creative 250-piece building block set for kids aged 4+. Boosts imagination, motor skills and problem solving.",
    specs: { Pieces: "250", Age: "4+ years", Material: "Non-toxic ABS" },
    variants: [],
  },
  {
    title: "Stainless Steel Pressure Cooker 5L",
    category: "Appliances", sub: "Kitchen Appliances", brand: "HomeNest",
    price: 1799, mrp: 3499, stock: 16, rating: 4.3, ratingCount: 58, featured: 0,
    image: "/img/cooker.svg",
    description: "5 litre stainless steel pressure cooker with induction base, safety valve and easy-grip handles.",
    specs: { Capacity: "5 litres", Material: "Stainless steel", Base: "Induction compatible" },
    variants: [],
  },
  {
    title: "Yoga Mat 6mm Anti-Slip",
    category: "Sports & Fitness", sub: "Yoga", brand: "Aamart Essentials",
    price: 499, mrp: 1199, stock: 0, rating: 4.1, ratingCount: 64, featured: 0,
    image: "/img/yoga.svg",
    description: "Extra thick 6mm anti-slip yoga mat with carrying strap. Cushioned support for yoga, pilates and home workouts.",
    specs: { Thickness: "6mm", Material: "NBR foam", Includes: "Carry strap" },
    variants: [],
  },
];

const SEED_BANNERS = [
  { title: "Big Festive Sale", subtitle: "Up to 70% off on top categories", image: "/img/banner1.svg", link: "#/products?sort=discount", sort: 1 },
  { title: "New Electronics", subtitle: "Latest gadgets at best prices", image: "/img/banner2.svg", link: "#/products?category=Electronics", sort: 2 },
  { title: "Fashion Fiesta", subtitle: "Fresh styles starting at \u20B9299", image: "/img/banner3.svg", link: "#/products?category=Women", sort: 3 },
];

function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "aamart.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  createSchema(db);
  seed(db);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super','manager')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      role TEXT PRIMARY KEY,
      permissions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '',
      parent_id TEXT,
      sort INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      category_id TEXT,
      subcategory_id TEXT,
      brand_id TEXT,
      price REAL NOT NULL DEFAULT 0,
      mrp REAL NOT NULL DEFAULT 0,
      discount INTEGER DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      sku TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      featured INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      specs TEXT DEFAULT '{}',
      variants TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      url TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      price REAL,
      stock INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      change INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      by TEXT DEFAULT '',
      at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant TEXT DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 1,
      saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, product_id, variant, saved)
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT DEFAULT '',
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      type TEXT DEFAULT 'Home',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      user_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT DEFAULT '',
      item_total REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      delivery_charge REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      payable REAL NOT NULL DEFAULT 0,
      coupon_code TEXT DEFAULT '',
      address_json TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'COD',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'Ordered',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      image TEXT DEFAULT '',
      variant TEXT DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT DEFAULT '',
      by TEXT DEFAULT '',
      at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      txn_id TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('percent','flat')),
      value REAL NOT NULL,
      min_order REAL NOT NULL DEFAULT 0,
      max_discount REAL NOT NULL DEFAULT 0,
      expires_at TEXT DEFAULT '',
      usage_limit INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      image TEXT DEFAULT '',
      link TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'approved',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor TEXT DEFAULT '',
      role TEXT DEFAULT '',
      action TEXT NOT NULL,
      meta TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_sub ON products(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
  `);
}

function seed(db) {
  const now = new Date().toISOString();

  const setSetting = db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)");
  const defaults = {
    siteName: "Aamart",
    tagline: "Shop smart. Live better.",
    currency: "INR",
    deliveryCharge: "49",
    freeDeliveryAbove: "499",
    taxPercent: "0",
    codEnabled: "1",
    upiEnabled: "1",
    cardEnabled: "1",
    netbankingEnabled: "1",
    walletEnabled: "1",
    upiId: "aamart@upi",
    supportEmail: "support@aamart.in",
    supportPhone: "1800-000-000",
    address: "Aamart Store, India",
  };
  for (const [k, v] of Object.entries(defaults)) setSetting.run(k, v);

  const roleInsert = db.prepare("INSERT OR IGNORE INTO roles(role, permissions) VALUES (?, ?)");
  roleInsert.run("super", JSON.stringify(["*"]));
  roleInsert.run("manager", JSON.stringify(["products", "orders", "reviews", "dashboard"]));

  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM admins").get().c;
  if (!adminCount) {
    const ins = db.prepare("INSERT INTO admins(id, username, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)");
    ins.run(randomId("adm"), "amirhamza", "Amir Hamza", hashPassword(process.env.AAMART_SUPER_PASSWORD || "akib@123"), "super", now);
    ins.run(randomId("adm"), "aditism", "Aditi SM", hashPassword(process.env.AAMART_MANAGER_PASSWORD || "aditi@123"), "manager", now);
  }

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (!userCount) {
    db.prepare("INSERT INTO users(id, name, email, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)")
      .run(randomId("usr"), "Test Customer", "test@aamart.in", "9876543210", hashPassword("test@123"), now, now);
  }

  const brandCount = db.prepare("SELECT COUNT(*) AS c FROM brands").get().c;
  if (!brandCount) {
    const ins = db.prepare("INSERT INTO brands(id, name, slug, active) VALUES (?, ?, ?, 1)");
    ["Aamart", "Aamart Essentials", "TechPro", "StyleHub", "HomeNest", "Generic"].forEach((b) => ins.run(randomId("brd"), b, slugify(b)));
  }

  const catCount = db.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
  if (!catCount) {
    const ins = db.prepare("INSERT INTO categories(id, name, slug, icon, parent_id, sort, active) VALUES (?, ?, ?, ?, ?, ?, 1)");
    let sort = 0;
    for (const parent of CATEGORY_TREE) {
      const pid = randomId("cat");
      ins.run(pid, parent.name, slugify(parent.name), parent.icon, null, sort++);
      let ssort = 0;
      for (const sub of parent.subs) {
        ins.run(randomId("cat"), sub, slugify(parent.name + "-" + sub), "", pid, ssort++);
      }
    }
  }

  const productCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  if (!productCount) seedProducts(db, now);

  const bannerCount = db.prepare("SELECT COUNT(*) AS c FROM banners").get().c;
  if (!bannerCount) {
    const ins = db.prepare("INSERT INTO banners(id, title, subtitle, image, link, active, sort) VALUES (?, ?, ?, ?, ?, 1, ?)");
    for (const b of SEED_BANNERS) ins.run(randomId("ban"), b.title, b.subtitle, b.image, b.link, b.sort);
  }

  const couponCount = db.prepare("SELECT COUNT(*) AS c FROM coupons").get().c;
  if (!couponCount) {
    const ins = db.prepare("INSERT INTO coupons(id, code, type, value, min_order, max_discount, expires_at, usage_limit, used_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)");
    ins.run(randomId("cpn"), "WELCOME10", "percent", 10, 499, 200, "", 0);
    ins.run(randomId("cpn"), "FLAT100", "flat", 100, 999, 0, "", 0);
    ins.run(randomId("cpn"), "AAMART20", "percent", 20, 1499, 500, "", 0);
  }

  const reviewCount = db.prepare("SELECT COUNT(*) AS c FROM reviews").get().c;
  if (!reviewCount) {
    const products = db.prepare("SELECT id FROM products ORDER BY created_at DESC LIMIT 4").all();
    const ins = db.prepare("INSERT INTO reviews(id, product_id, user_id, name, rating, title, body, status, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 'approved', ?)");
    const samples = [
      { name: "Rahul S.", rating: 5, title: "Excellent quality", body: "Product is exactly as described. Delivery was quick and packaging was good." },
      { name: "Priya M.", rating: 4, title: "Value for money", body: "Good quality for the price. Would recommend to friends and family." },
      { name: "Amit K.", rating: 5, title: "Loved it", body: "Using it daily and very happy with the purchase. Five stars." },
    ];
    products.forEach((p, i) => {
      const s = samples[i % samples.length];
      ins.run(randomId("rev"), p.id, s.name, s.rating, s.title, s.body, now);
    });
  }
}

function seedProducts(db, now) {
  const getCat = db.prepare("SELECT id FROM categories WHERE name = ? AND parent_id IS NULL LIMIT 1");
  const getSub = db.prepare("SELECT id FROM categories WHERE name = ? AND parent_id = ? LIMIT 1");
  const getBrand = db.prepare("SELECT id FROM brands WHERE name = ? LIMIT 1");
  const insProduct = db.prepare(`
    INSERT INTO products(id, title, slug, description, category_id, subcategory_id, brand_id, price, mrp, discount, stock, sku, status, featured, rating, rating_count, specs, variants, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
  `);
  const insImage = db.prepare("INSERT INTO product_images(id, product_id, url, sort) VALUES (?, ?, ?, ?)");
  const insVariant = db.prepare("INSERT INTO product_variants(id, product_id, type, value, price, stock) VALUES (?, ?, ?, ?, ?, ?)");

  let offset = 0;
  for (const p of SEED_PRODUCTS) {
    const cat = getCat.get(p.category);
    const sub = cat ? getSub.get(p.sub, cat.id) : null;
    const brand = getBrand.get(p.brand);
    const pid = randomId("prd");
    const discount = p.mrp > 0 ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
    const createdAt = new Date(Date.now() - offset++ * 60000).toISOString();
    insProduct.run(
      pid, p.title, slugify(p.title), p.description,
      cat ? cat.id : null, sub ? sub.id : null, brand ? brand.id : null,
      p.price, p.mrp, discount, p.stock, "AAM-" + slugify(p.title).slice(0, 10).toUpperCase(),
      p.featured || 0, p.rating || 0, p.ratingCount || 0,
      JSON.stringify(p.specs || {}), JSON.stringify(p.variants || []),
      createdAt, now
    );
    insImage.run(randomId("img"), pid, p.image, 0);
    if (p.image === "/img/earbuds.svg") insImage.run(randomId("img"), pid, "/img/headphones.svg", 1);
    if (p.image === "/img/phone.svg") insImage.run(randomId("img"), pid, "/img/laptop.svg", 1);
    for (const v of p.variants || []) {
      insVariant.run(randomId("var"), pid, v.type, v.value, v.price, null);
    }
  }
}

function jsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function logActivity(db, { actor, role, action, meta, ip }) {
  db.prepare("INSERT INTO activity_logs(id, actor, role, action, meta, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(randomId("log"), actor || "", role || "", action, meta ? JSON.stringify(meta) : "", ip || "", new Date().toISOString());
}

module.exports = { openDatabase, jsonParse, logActivity, CATEGORY_TREE };

const API = "/api";
let allProducts = [];
let categories = [];
let activeCategory = "all";
let activeSub = "all";
let searchQ = "";
let cart = loadCart();

function $(id) { return document.getElementById(id); }
function money(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem("AAMART_cart")) || []; } catch { return []; }
}
function saveCart() { localStorage.setItem("AAMART_cart", JSON.stringify(cart)); updateCartCount(); }
function productImage(p) { return p.image || "/img/placeholder"; }

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove("show"), 2200);
}

async function loadProducts() {
  let url = "/products?";
  if (activeCategory !== "all") url += "category=" + encodeURIComponent(activeCategory) + "&";
  if (activeSub && activeSub !== "all") url += "sub=" + encodeURIComponent(activeSub) + "&";
  if (searchQ) url += "q=" + encodeURIComponent(searchQ) + "&";
  const data = await api(url);
  allProducts = data.products;
  renderGrid();
}

function renderGrid() {
  const grid = $("productGrid");
  const list = allProducts;
  $("emptyMsg").style.display = list.length ? "none" : "block";
  grid.innerHTML = list.map((p) => {
    const oos = (p.stock || 0) <= 0;
    return `
      <article class="card" onclick="openProduct('${p.id}')">
        <div class="card-img"><img src="${esc(productImage(p))}" alt="${esc(p.name)}" onerror="this.src='/img/placeholder.svg'" /></div>
        <div class="card-body">
          <p class="card-cat">${esc(p.category || "Others")}${p.sub ? " &middot; " + esc(p.sub) : ""}</p>
          <h3 class="card-name">${esc(p.name)}</h3>
          <div class="price-row">
            <span class="price">${money(p.price)}</span>
            ${p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span><span class="disc">${p.discount}% off</span>` : ""}
          </div>
          ${oos ? `<div class="oos">Out of Stock</div>` : `<span class="rating-badge">${(p.rating || 0).toFixed(1)} &#9733;</span>`}
        </div>
      </article>`;
  }).join("");
}

async function loadCategories() {
  const data = await api("/categories");
  categories = data.categories;
  const bar = $("catBar");
  const items = [{ name: "all", icon: "\u{1F3E0}" }].concat(categories);
  bar.innerHTML = items.map((c) =>
    `<button class="cat-item ${c.name === activeCategory ? "active" : ""}" data-cat="${esc(c.name)}" onclick="setCategory(this.dataset.cat)">${c.icon ? c.icon + " " : ""}${esc(c.name === "all" ? "All Products" : c.name)}</button>`
  ).join("");
}

function setCategory(name) {
  activeCategory = name;
  activeSub = "all";
  document.querySelectorAll(".cat-item").forEach((b) => b.classList.toggle("active", b.dataset.cat === name));
  const cat = categories.find((c) => c.name === name);
  $("sectionTitle").textContent = name === "all" ? "Popular Products" : (cat && cat.icon ? cat.icon + " " : "") + name;
  renderSubs(cat);
  loadProducts();
}

function renderSubs(cat) {
  const bar = $("subBar");
  if (!cat || !cat.subs || !cat.subs.length) { bar.innerHTML = ""; return; }
  bar.innerHTML =
    `<button class="sub-chip ${activeSub === "all" ? "active" : ""}" data-sub="all" onclick="setSub(this.dataset.sub)">All</button>` +
    cat.subs.map((s) =>
      `<button class="sub-chip ${s === activeSub ? "active" : ""}" data-sub="${esc(s)}" onclick="setSub(this.dataset.sub)">${esc(s)}</button>`
    ).join("");
}

function setSub(sub) {
  activeSub = sub;
  document.querySelectorAll(".sub-chip").forEach((b) => b.classList.toggle("active", b.dataset.sub === sub));
  loadProducts();
}

function goHome() { activeCategory = "all"; activeSub = "all"; searchQ = ""; $("searchInput").value = ""; $("subBar").innerHTML = ""; loadCategories(); loadProducts(); return false; }
function scrollToProducts() { $("productGrid").scrollIntoView({ behavior: "smooth" }); }

async function openProduct(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  const oos = (p.stock || 0) <= 0;
  $("modalBox").className = "modal";
  $("modalBox").innerHTML = `
    <div class="pd">
      <div class="pd-img"><img src="${esc(productImage(p))}" alt="${esc(p.name)}" onerror="this.src='/img/placeholder.svg'" /></div>
      <div class="pd-info">
        <h2>${esc(p.name)}</h2>
        <p class="pd-cat">${esc(p.category || "Others")}</p>
        <div class="pd-price">
          <span class="price">${money(p.price)}</span>
          ${p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span><span class="disc">${p.discount}% off</span>` : ""}
        </div>
        ${oos ? `<div class="oos">Out of Stock</div>` : `<div class="stock-line"><span class="rating-badge">${(p.rating || 0).toFixed(1)} &#9733;</span> &nbsp; In stock (${p.stock})</div>`}
        <p class="pd-desc">${esc(p.description || "No description provided.")}</p>
        <div class="pd-actions">
          <button class="add-btn" onclick="addToCart('${p.id}')" ${oos ? "disabled" : ""}>ADD TO CART</button>
          <button class="buy-btn" onclick="buyNow('${p.id}')" ${oos ? "disabled" : ""}>BUY NOW</button>
        </div>
      </div>
    </div>`;
  $("modal").classList.add("show");
}
function closeModal() { $("modal").classList.remove("show"); }

function addToCart(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  const row = cart.find((c) => c.id === id);
  if (row) row.qty += 1;
  else cart.push({ id, name: p.name, price: p.price, image: p.image, qty: 1 });
  saveCart();
  toast("Added to cart");
}
function buyNow(id) { addToCart(id); closeModal(); openCart(); }
function changeQty(id, delta) {
  const row = cart.find((c) => c.id === id);
  if (!row) return;
  row.qty += delta;
  if (row.qty <= 0) cart = cart.filter((c) => c.id !== id);
  saveCart();
  renderCart();
}
function removeItem(id) { cart = cart.filter((c) => c.id !== id); saveCart(); renderCart(); }

function updateCartCount() {
  $("cartCount").textContent = cart.reduce((s, c) => s + c.qty, 0);
}
function cartTotal() { return cart.reduce((s, c) => s + c.price * c.qty, 0); }

function renderCart() {
  const box = $("cartItems");
  if (!cart.length) {
    box.innerHTML = `<div class="cart-empty">Your cart is empty</div>`;
  } else {
    box.innerHTML = cart.map((c) => `
      <div class="cart-row">
        <img src="${esc(productImage(c))}" onerror="this.src='/img/placeholder.svg'" />
        <div class="info">
          <h4>${esc(c.name)}</h4>
          <div class="p">${money(c.price)}</div>
          <div class="qty">
            <button onclick="changeQty('${c.id}',-1)">-</button>
            <span>${c.qty}</span>
            <button onclick="changeQty('${c.id}',1)">+</button>
          </div>
          <button class="remove" onclick="removeItem('${c.id}')">Remove</button>
        </div>
      </div>`).join("");
  }
  $("cartTotal").textContent = money(cartTotal());
  $("checkoutBtn").disabled = cart.length === 0;
}
function openCart() { if(window.innerWidth <= 900){ showCartPage(); updateCartCount(); return false; } renderCart(); cartDrawer.classList.add('show'); overlay.classList.add('show'); return false; }
function closeAll() { $("cartDrawer").classList.remove("show"); $("overlay").classList.remove("show"); }

function checkout() {
  if (!cart.length) return;
  $("modalBox").className = "modal tiny";
  $("modalBox").innerHTML = `
    <div style="padding:22px">
      <h2 style="margin:0 0 14px">Delivery Details</h2>
      <div class="field"><label>Full Name</label><input id="cName" placeholder="Your name" /></div>
      <div class="field"><label>Phone</label><input id="cPhone" placeholder="10-digit mobile" /></div>
      <div class="field"><label>Address</label><textarea id="cAddr" rows="3" placeholder="House, street, city, pincode"></textarea></div>
      <div class="cod-note">&#128181; Payment Method: <b>Cash on Delivery (COD)</b><br><span>Order ki delivery ke waqt payment karein. Online payment jald aa raha hai.</span></div>
      <div class="cart-total"><span>Total to pay on delivery</span><strong>${money(cartTotal())}</strong></div>
      <button class="primary-btn full" onclick="placeOrder()">Place Order (COD)</button>
    </div>`;
  $("modal").classList.add("show");
}

async function placeOrder() {
  const name = $("cName").value.trim();
  const phone = $("cPhone").value.trim();
  const address = $("cAddr").value.trim();
  if (!name || !phone || !address) return toast("Please fill all fields");
  try {
    const order = await api("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((c) => ({ id: c.id, qty: c.qty, price: c.price, name: c.name })),
        customer: { name, phone, address },
      }),
    });
    cart = [];
    saveCart();
    closeAll();
    closeModal();
    $("modalBox").className = "modal tiny";
    $("modalBox").innerHTML = `
      <div style="padding:30px;text-align:center">
        <div style="font-size:52px">&#9989;</div>
        <h2 style="margin:10px 0">Order Placed!</h2>
        <p style="color:#878787">Your order id is <b>${esc(order.id)}</b></p>
        <p>Payment: <b>Cash on Delivery</b></p>
        <p>Amount to pay on delivery: <b>${money(order.total)}</b></p>
        <button class="primary-btn" onclick="closeModal()">Continue Shopping</button>
      </div>`;
    $("modal").classList.add("show");
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- Customer auth ---------- */
let customer = null;
let authEmail = "";
let authSignupToken = "";
let authAfter = "";

function getToken() { return localStorage.getItem("AAMART_customer_token") || ""; }
function setToken(t) {
  if (t) localStorage.setItem("AAMART_customer_token", t);
  else localStorage.removeItem("AAMART_customer_token");
}
function customerFetch(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {},
    getToken() ? { Authorization: "Bearer " + getToken() } : {}
  );
  return fetch(API + path, opts).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}
function notYet() { toast("This feature is coming soon"); return false; }

function openProfile() {
  if (customer) location.href = "/myprofile.html";
  else openAuth("profile");
  return false;
}
function doLogout() {
  setToken("");
  customer = null;
  updateLoginUI();
  toast("Logged out");
  return false;
}
function onUserBtn() {
  if (customer) { location.href = "/myprofile.html"; }
  else { openAuth(""); }
  return false;
}
function updateLoginUI() {
  const btn = $("loginBtn");
  const logoutMenu = $("logoutMenu");
  if (btn) {
    if (customer) btn.innerHTML = '<span class="uname">' + esc(customer.name || customer.email) + '</span> <span>&#9662;</span>';
    else btn.innerHTML = 'Login <span>&#9662;</span>';
  }
  if (logoutMenu) logoutMenu.style.display = customer ? "block" : "none";
}

function openAuth(after) {
  authAfter = after || "";
  renderAuthStep("email", {});
  $("authModal").classList.add("show");
  return false;
}
function closeAuth() { $("authModal").classList.remove("show"); }
function authError(msg) { const el = $("authError"); if (el) el.textContent = msg || ""; }

function renderAuthStep(step, ctx) {
  ctx = ctx || {};
  if (ctx.email) authEmail = ctx.email.toLowerCase();
  if (ctx.signupToken) authSignupToken = ctx.signupToken;
  const box = $("authBox");
  const pad = (inner) => `<div class="auth-pad">${inner}</div>`;
  if (step === "email") {
    box.innerHTML = pad(`
      <h2 class="auth-title">Login to AAMART</h2>
      <p class="auth-sub">Enter your email address to continue</p>
      <div class="field"><label>Email Address</label><input id="authEmail" type="email" placeholder="you@example.com" value="${esc(ctx.email || "")}" /></div>
      <button class="primary-btn full" onclick="authCheck()">Continue</button>
      <p id="authError" class="auth-err"></p>`);
  } else if (step === "password") {
    box.innerHTML = pad(`
      <h2 class="auth-title">Welcome back</h2>
      <p class="auth-sub">Login to <b>${esc(authEmail)}</b></p>
      <div class="field"><label>Password</label><input id="authPass" type="password" placeholder="Your password" /></div>
      <button class="primary-btn full" onclick="authLogin()">Login</button>
      <p class="auth-link"><a href="#" onclick="return authSwitch()">Use a different email</a></p>
      <p id="authError" class="auth-err"></p>`);
  } else if (step === "otp") {
    box.innerHTML = pad(`
      <h2 class="auth-title">Verify your email</h2>
      <p class="auth-sub">A 6-digit OTP was sent to <b>${esc(authEmail)}</b></p>
      ${ctx.demo ? `<div class="auth-demo">Demo OTP (for testing): <b>${esc(ctx.demo)}</b></div>` : ""}
      <div class="field"><label>Enter OTP</label><input id="authOtp" inputmode="numeric" maxlength="6" placeholder="6-digit code" /></div>
      <button class="primary-btn full" onclick="authVerifyOtp()">Verify OTP</button>
      <p class="auth-link"><a href="#" onclick="return authResend()">Resend OTP</a></p>
      <p id="authError" class="auth-err"></p>`);
  } else if (step === "signup") {
    box.innerHTML = pad(`
      <h2 class="auth-title">Create your account</h2>
      <p class="auth-sub">New user &mdash; set up your profile for <b>${esc(authEmail)}</b></p>
      <div class="field"><label>Full Name</label><input id="authName" placeholder="Your full name" /></div>
      <div class="field"><label>Mobile Number</label><input id="authPhone" inputmode="numeric" placeholder="10-digit mobile number" /></div>
      <div class="field"><label>Create Password</label><input id="authPass" type="password" placeholder="Min 4 characters" /></div>
      <button class="primary-btn full" onclick="authComplete()">Create Account</button>
      <p id="authError" class="auth-err"></p>`);
  }
}

async function authCheck() {
  const email = $("authEmail").value.trim().replace(/\s+/g, "");
  if (!email) return authError("Please enter your email");
  authError("");
  try {
    const data = await customerFetch("/auth/check", { method: "POST", body: JSON.stringify({ email }) });
    if (data.exists && data.hasPassword) renderAuthStep("password", { email });
    else authResend(email);
  } catch (e) { authError(e.message); }
}
async function authResend(email) {
  if (email) authEmail = email.trim().toLowerCase().replace(/\s+/g, "");
  authError("");
  try {
    const data = await customerFetch("/auth/send-otp", { method: "POST", body: JSON.stringify({ email: authEmail }) });
    renderAuthStep("otp", { email: authEmail, demo: data.demo });
    toast("OTP sent to " + authEmail);
  } catch (e) {
    if (/already registered/i.test(e.message)) renderAuthStep("password", { email: authEmail });
    else authError(e.message);
  }
}
async function authVerifyOtp() {
  const otp = $("authOtp").value.trim();
  if (otp.length !== 6) return authError("Enter the 6-digit OTP");
  authError("");
  try {
    const data = await customerFetch("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: authEmail, otp }) });
    renderAuthStep("signup", { email: authEmail, signupToken: data.signupToken });
  } catch (e) { authError(e.message); }
}
async function authComplete() {
  const name = $("authName").value.trim();
  const phone = $("authPhone").value.trim();
  const password = $("authPass").value;
  if (!name) return authError("Please enter your full name");
  if (phone.replace(/\D/g, "").length !== 10) return authError("Enter a valid 10-digit mobile number");
  if (password.length < 4) return authError("Password must be at least 4 characters");
  authError("");
  try {
    const data = await customerFetch("/auth/complete", {
      method: "POST",
      body: JSON.stringify({ signupToken: authSignupToken, name, phone, password }),
    });
    onAuthSuccess(data);
  } catch (e) { authError(e.message); }
}
async function authLogin() {
  const password = $("authPass").value;
  if (!password) return authError("Please enter your password");
  authError("");
  try {
    const data = await customerFetch("/auth/login", { method: "POST", body: JSON.stringify({ email: authEmail, password }) });
    onAuthSuccess(data);
  } catch (e) { authError(e.message); }
}
function authSwitch() { renderAuthStep("email", { email: authEmail }); return false; }
function onAuthSuccess(data) {
  setToken(data.token);
  customer = data.user;
  updateLoginUI();
  closeAuth();
  toast("Welcome, " + (customer.name || customer.email));
  if (authAfter === "profile") setTimeout(() => (location.href = "/myprofile.html"), 400);
}
async function loadSession() {
  if (!getToken()) { updateLoginUI(); return; }
  try {
    const data = await customerFetch("/auth/me");
    customer = data.user;
  } catch { setToken(""); customer = null; }
  updateLoginUI();
}

function bindEvents() {
  $("year").textContent = new Date().getFullYear();
  $("searchBtn").onclick = () => { searchQ = $("searchInput").value.trim(); loadProducts(); };
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { searchQ = $("searchInput").value.trim(); loadProducts(); }
  });
}

function hideSplash(){}

async function init() {
  setTimeout(hideSplash,50);
  bindEvents();
  updateCartCount();
  await loadSession();
  try {
    await loadCategories();
    await loadProducts();
  } catch (e) {
    toast("Could not load products: " + e.message);
  }
  const params = new URLSearchParams(location.search);
  if (params.get("login") === "1" && !customer) openAuth("profile");
}
document.addEventListener('DOMContentLoaded',function(){hideSplash();setTimeout(hideSplash,50);setTimeout(hideSplash,200);}); setTimeout(hideSplash,0); setTimeout(hideSplash,100); setTimeout(hideSplash,500); hideSplash(); setTimeout(hideSplash,10); setTimeout(hideSplash,50); setTimeout(hideSplash,200); init();\n  

function showCartPage() {
  document.querySelectorAll('main > section:not(#cartPage)').forEach(s=>s.style.display='none');
  document.querySelector('.catbar').style.display='none';
  const cp = document.getElementById('cartPage');
  if(cp) cp.classList.add('active');
  renderCartPage();
  window.scrollTo({top:0, behavior:'instant'});
  return false;
}
function hideCartPage() {
  document.querySelectorAll('main > section:not(#cartPage)').forEach(s=>s.style.display='');
  document.querySelector('.catbar').style.display='';
  const cp = document.getElementById('cartPage');
  if(cp) cp.classList.remove('active');
  return false;
}
function renderCartPage() {
  const list = document.getElementById('cartPageItems');
  const p = document.getElementById('cpPrice');
  const t = document.getElementById('cpTotal');
  const btn = document.getElementById('cpCheckout');
  if(!list) return;
  if(!cart.length) {
    list.innerHTML = <div style="background:#fff;padding:40px;text-align:center;border-radius:2px;">Your cart is empty</div>;
    if(p) p.textContent = money(0);
    if(t) t.textContent = money(0);
    if(btn) btn.disabled = true;
    return;
  }
  const total = cartTotal();
  if(p) p.textContent = money(total);
  if(t) t.textContent = money(total);
  if(btn) btn.disabled = false;
  list.innerHTML = cart.map(c=>{
    const prod = products.find(x=>x.id===c.id)||c;
    const mrp = prod.mrp || Math.round(c.price * 1.4);
    const disc = Math.max(0, Math.round((1-c.price/mrp)*100));
    return <div class="cp-row-item">
      <img class="cp-img" src="" onerror="this.src='/img/placeholder.svg'">
      <div class="cp-info">
        <div class="cp-name"></div>
        <div class="cp-meta"></div>
        <div class="cp-price-row">
          <span class="cp-price"></span>
          <span class="cp-mrp"></span>
          <span class="cp-disc">% off</span>
        </div>
        <div class="cp-actions">
          <div class="cp-qty">
            <button onclick="cpQty('',-1)">-</button>
            <span></span>
            <button onclick="cpQty('',1)">+</button>
          </div>
          <button class="cp-link" onclick="removeItem('');renderCartPage();">REMOVE</button>
          <button class="cp-link blue" onclick="buyNow('')">BUY NOW</button>
        </div>
      </div>
    </div>;
  }).join('');
}
function cpQty(id,delta){ changeQty(id,delta); renderCartPage(); updateCartCount(); }
function checkoutFromPage(){ hideCartPage(); checkout(); }

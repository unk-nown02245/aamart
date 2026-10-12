const API = "/api";
let token = localStorage.getItem("AAMART_admin_token") || "";
let products = [];
let categories = [];
let editingId = null;

function $(id) { return document.getElementById(id); }
function money(n) { return "\u20B9" + Number(n || 0).toLocaleString("en-IN"); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = isErr ? "#c62828" : "#333";
  t.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove("show"), 2500);
}

async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {},
    token ? { Authorization: "Bearer " + token } : {}
  );
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error(data.error || "Session expired"); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- Auth ---------- */
async function doLogin(e) {
  e.preventDefault();
  $("loginError").textContent = "";
  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;
  try {
    const data = await api("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    token = data.token;
    localStorage.setItem("AAMART_admin_token", token);
    showApp(data.username);
  } catch (err) {
    $("loginError").textContent = err.message;
  }
  return false;
}
function logout() {
  token = "";
  localStorage.removeItem("AAMART_admin_token");
  $("appView").style.display = "none";
  $("loginView").style.display = "flex";
}
async function boot() {
  if (!token) return;
  try {
    const me = await api("/admin/me");
    showApp(me.username);
  } catch {
    logout();
  }
}
function showApp(username) {
  $("loginView").style.display = "none";
  $("appView").style.display = "flex";
  $("adminName").textContent = username;
  loadCategories();
  loadDashboard();
  loadProducts();
  loadOrders();
}
async function loadCategories() {
  try { categories = (await api("/categories")).categories; } catch {}
}
function catOptions(selected) {
  const names = categories.map((c) => c.name);
  if (selected && names.indexOf(selected) < 0) names.unshift(selected);
  return '<option value="">Select category</option>' +
    names.map((n) => `<option ${n === selected ? "selected" : ""}>${esc(n)}</option>`).join("");
}
function subOptions(category, selected) {
  const cat = categories.find((c) => c.name === category);
  let subs = cat ? cat.subs.slice() : [];
  if (selected && subs.indexOf(selected) < 0) subs.unshift(selected);
  return '<option value="">None</option>' +
    subs.map((s) => `<option ${s === selected ? "selected" : ""}>${esc(s)}</option>`).join("");
}
function onCategoryChange() {
  $("fSub").innerHTML = subOptions($("fCategory").value, "");
}

/* ---------- Tabs ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => (t.style.display = "none"));
  $("tab-" + name).style.display = "block";
  document.querySelectorAll(".side-link").forEach((l) => l.classList.toggle("active", l.dataset.tab === name));
  if (name === "dashboard") loadDashboard();
  if (name === "products") loadProducts();
  if (name === "orders") loadOrders();
}

/* ---------- Dashboard ---------- */
async function loadDashboard() {
  try {
    const s = await api("/stats");
    $("statProducts").textContent = s.products;
    $("statOrders").textContent = s.orders;
    $("statRevenue").textContent = money(s.revenue);
    $("statOos").textContent = s.outOfStock;
  } catch (e) { toast(e.message, true); }
  try {
    const data = await api("/orders");
    $("recentOrders").innerHTML = data.orders.slice(0, 5).map((o) => `
      <div class="cart-row" style="border-bottom:1px solid var(--line)">
        <div class="info">
          <h4>${esc(o.id)} &middot; ${esc(o.customer.name || "Guest")}</h4>
          <small style="color:var(--muted)">${o.items.length} item(s) &middot; ${new Date(o.createdAt).toLocaleString()}</small>
        </div>
        <strong>${money(o.total)}</strong>
      </div>`).join("") || `<p class="empty">No orders yet.</p>`;
  } catch {}
}

/* ---------- Products ---------- */
async function loadProducts() {
  const data = await api("/products");
  products = data.products;
  const body = $("productTable");
  $("noProducts").style.display = products.length ? "none" : "block";
  body.innerHTML = products.map((p) => `
    <tr>
      <td>
        <div class="prod-cell">
          <img src="${esc(p.image || "/img/placeholder.svg")}" onerror="this.src='/img/placeholder.svg'" />
          <div><b>${esc(p.name)}</b><small>${esc((p.description || "").slice(0, 40))}</small></div>
        </div>
      </td>
      <td>${esc(p.category || "-")}</td>
      <td><b>${money(p.price)}</b><br><small style="color:var(--muted);text-decoration:line-through">${money(p.mrp)}</small></td>
      <td>${p.stock > 0 ? p.stock : '<span style="color:#d32f2f">Out</span>'}</td>
      <td>${(p.rating || 0).toFixed(1)} &#9733;</td>
      <td>
        <div class="row-actions">
          <button class="mini-btn mini-edit" onclick="openProductForm('${p.id}')">Edit</button>
          <button class="mini-btn mini-del" onclick="deleteProduct('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>`).join("");
}

function openProductForm(id) {
  editingId = id || null;
  const p = id ? products.find((x) => x.id === id) : { name: "", category: "", sub: "", price: "", mrp: "", stock: "", rating: "", image: "", description: "" };
  $("modalBox").className = "modal";
  $("modalBox").innerHTML = `
    <div style="padding:24px">
      <h2 style="margin:0 0 18px">${editingId ? "Edit Product" : "Add Product"}</h2>
      <div class="form-grid">
        <div class="field full"><label>Product Name *</label><input id="fName" value="${esc(p.name)}" placeholder="e.g. AAMART Wireless Earbuds" /></div>
        <div class="field"><label>Category</label><select id="fCategory" onchange="onCategoryChange()">${catOptions(p.category)}</select></div>
        <div class="field"><label>Subcategory</label><select id="fSub">${subOptions(p.category, p.sub)}</select></div>
        <div class="field"><label>Stock</label><input id="fStock" type="number" value="${esc(p.stock)}" placeholder="0" /></div>
        <div class="field"><label>Selling Price (&#8377;) *</label><input id="fPrice" type="number" value="${esc(p.price)}" placeholder="0" /></div>
        <div class="field"><label>MRP (&#8377;)</label><input id="fMrp" type="number" value="${esc(p.mrp)}" placeholder="0" /></div>
        <div class="field"><label>Rating (0-5)</label><input id="fRating" type="number" step="0.1" max="5" value="${esc(p.rating)}" placeholder="0" /></div>
        <div class="field"><label>Image URL or upload</label><input id="fImage" value="${esc(p.image)}" placeholder="/img/... or https://..." oninput="previewImg()" />
          <input type="file" accept="image/*" style="margin-top:8px" onchange="fileToData(this)" />
        </div>
        <img id="imgPreview" class="img-preview full" src="${esc(p.image || "/img/placeholder.svg")}" onerror="this.src='/img/placeholder.svg'" />
        <div class="field full"><label>Description</label><textarea id="fDesc" rows="3" placeholder="Product details...">${esc(p.description)}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="ghost-btn" onclick="closeModal()">Cancel</button>
        <button class="primary-btn" onclick="saveProduct()">${editingId ? "Update" : "Create"}</button>
      </div>
    </div>`;
  $("modal").classList.add("show");
}
function previewImg() {
  const v = $("fImage").value.trim();
  $("imgPreview").src = v || "/img/placeholder.svg";
}
function fileToData(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("fImage").value = reader.result;
    $("imgPreview").src = reader.result;
  };
  reader.readAsDataURL(file);
}
function closeModal() { $("modal").classList.remove("show"); }

async function saveProduct() {
  const body = {
    name: $("fName").value.trim(),
    category: $("fCategory").value.trim() || "Others",
    sub: $("fSub").value.trim(),
    price: Number($("fPrice").value) || 0,
    mrp: Number($("fMrp").value) || 0,
    stock: Number($("fStock").value) || 0,
    rating: Number($("fRating").value) || 0,
    image: $("fImage").value.trim(),
    description: $("fDesc").value.trim(),
  };
  if (!body.name) return toast("Product name is required", true);
  if (body.price <= 0) return toast("Selling price must be greater than 0", true);
  if (body.mrp < body.price) body.mrp = body.price;
  try {
    if (editingId) {
      await api("/products/" + editingId, { method: "PUT", body: JSON.stringify(body) });
      toast("Product updated");
    } else {
      await api("/products", { method: "POST", body: JSON.stringify(body) });
      toast("Product created");
    }
    closeModal();
    loadProducts();
    loadDashboard();
  } catch (e) { toast(e.message, true); }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  try {
    await api("/products/" + id, { method: "DELETE" });
    toast("Product deleted");
    loadProducts();
    loadDashboard();
  } catch (e) { toast(e.message, true); }
}

/* ---------- Orders ---------- */
async function loadOrders() {
  const data = await api("/orders");
  const orders = data.orders;
  $("noOrders").style.display = orders.length ? "none" : "block";
  $("orderTable").innerHTML = orders.map((o) => `
    <tr>
      <td><b>${esc(o.id)}</b><br><small style="color:var(--muted)">${new Date(o.createdAt).toLocaleString()}</small></td>
      <td>${esc(o.customer.name || "Guest")}<br><small style="color:var(--muted)">${esc(o.customer.phone || "")}</small></td>
      <td>${o.items.map((i) => `${esc(i.name)} x${i.qty}`).join("<br>")}</td>
      <td><b>${money(o.total)}</b></td>
      <td>
        <select class="status-select" onchange="setStatus('${o.id}', this.value)">
          ${["Placed", "Shipped", "Delivered", "Cancelled"].map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
    </tr>`).join("");
}
async function setStatus(id, status) {
  try {
    await api("/orders/" + id, { method: "PUT", body: JSON.stringify({ status }) });
    toast("Order marked " + status);
  } catch (e) { toast(e.message, true); }
}

function hideSplash() {
  const s = document.getElementById("splash");
  if (s) s.classList.add("hide");
}

setTimeout(hideSplash, 2200);
boot();

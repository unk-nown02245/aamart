"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}

function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored || "").split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const actual = crypto.scryptSync(String(password), salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function loadSecret(dataDir) {
  if (process.env.AAMART_SECRET) return String(process.env.AAMART_SECRET);
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  const file = path.join(dataDir, "secret.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && parsed.secret) return parsed.secret;
  } catch {}
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, JSON.stringify({ secret, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return secret;
}

function createTokenManager(secret) {
  const TTL = 12 * 60 * 60 * 1000;
  function sign(payload, ttl) {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Date.now() + (ttl || TTL) })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return body + "." + sig;
  }
  function verify(token) {
    if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
    const idx = token.lastIndexOf(".");
    const body = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const expect = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(String(sig));
    const b = Buffer.from(String(expect));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, "base64url").toString());
      if (!data.exp || data.exp < Date.now()) return null;
      return data;
    } catch {
      return null;
    }
  }
  return { sign, verify };
}

function constantTimeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function randomId(prefix) {
  return (prefix ? prefix + "_" : "") + Date.now().toString(36) + crypto.randomBytes(5).toString("hex");
}

function randomCode(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < (len || 10); i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

function otp() {
  return String(crypto.randomInt(100000, 1000000));
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

module.exports = {
  hashPassword,
  verifyPassword,
  loadSecret,
  createTokenManager,
  constantTimeEqual,
  randomId,
  randomCode,
  otp,
  slugify,
};

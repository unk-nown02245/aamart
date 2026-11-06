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

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 10) return "Password must be at least 10 characters";
  if (value.length > 128) return "Password must be 128 characters or fewer";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "Password must include lowercase, uppercase and a number";
  }
  if (/^(password|qwerty|admin|welcome|letmein|aamart)/i.test(value)) {
    return "Password is too common. Choose a stronger password";
  }
  return null;
}

function generatePassword(length) {
  const len = Math.max(16, Number(length) || 24);
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = lower + upper + digits + symbols;
  const chars = [
    lower[crypto.randomInt(lower.length)],
    upper[crypto.randomInt(upper.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  while (chars.length < len) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function hashOtp(secret, email, code) {
  return crypto.createHmac("sha256", String(secret)).update(String(email).toLowerCase() + ":" + String(code)).digest("hex");
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
  const DEFAULT_TTL = 365 * 24 * 60 * 60 * 1000;
  const TTL = Math.max(15 * 60 * 1000, Number(process.env.AAMART_TOKEN_TTL_MS) || DEFAULT_TTL);
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
  validatePassword,
  generatePassword,
  hashOtp,
  loadSecret,
  createTokenManager,
  constantTimeEqual,
  randomId,
  randomCode,
  otp,
  slugify,
};

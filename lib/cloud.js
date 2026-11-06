"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ARCHIVE_NAME = "aamart-backup.tar.gz";
const DB_FILE = "aamart.db";
const SECRET_FILE = "secret.json";

let dbRef = null;
let rootRef = "";
let timer = null;
let interval = null;
let running = false;
let pending = false;
let dirty = false;
let shuttingDown = false;
let lastKeepAlive = 0;

function env(name) {
  return String(process.env[name] || "").trim();
}

function supabaseUrl() {
  return env("SUPABASE_URL").replace(/\/+$/, "");
}

function supabaseKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_KEY");
}

function bucket() {
  return env("AAMART_BACKUP_BUCKET") || "aamart-backups";
}

function enabled() {
  return !!(supabaseUrl() && supabaseKey());
}

function headers(extra) {
  const key = supabaseKey();
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    ...(extra || {}),
  };
}

function objectUrl() {
  return supabaseUrl() + "/storage/v1/object/" + encodeURIComponent(bucket()) + "/" + encodeURIComponent(ARCHIVE_NAME);
}

async function ensureBucket() {
  const res = await fetch(supabaseUrl() + "/storage/v1/bucket", {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: bucket(), name: bucket(), public: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) return;
  const text = await res.text();
  if (/already exists|duplicate/i.test(text)) return;
  throw new Error("Supabase bucket setup failed (" + res.status + "): " + text.slice(0, 300));
}

async function downloadArchive(dest) {
  const res = await fetch(objectUrl(), {
    headers: headers(),
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Cloud restore failed (" + res.status + "): " + text.slice(0, 300));
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

function removeWalFiles(dataDir) {
  ["-wal", "-shm"].forEach((suffix) => {
    try { fs.rmSync(path.join(dataDir, DB_FILE + suffix), { force: true }); } catch {}
  });
}

function extractArchive(archive, root) {
  execFileSync("tar", ["-xzf", archive, "-C", root], { stdio: "pipe" });
  removeWalFiles(path.join(root, "data"));
}

async function restore(root) {
  if (!enabled()) {
    console.log("[AAMART] Cloud backup disabled. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it.");
    return { restored: false, skipped: true };
  }

  await ensureBucket();
  const tmp = path.join(os.tmpdir(), "aamart-restore-" + process.pid + "-" + Date.now() + ".tar.gz");
  try {
    const found = await downloadArchive(tmp);
    if (!found) {
      console.log("[AAMART] No cloud backup found yet. Starting with a fresh local database.");
      return { restored: false, fresh: true };
    }
    extractArchive(tmp, root);
    console.log("[AAMART] Cloud backup restored successfully.");
    return { restored: true };
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

function archivePaths(root) {
  const dataDir = path.join(root, "data");
  const paths = [];
  if (fs.existsSync(path.join(dataDir, DB_FILE))) paths.push(path.join("data", DB_FILE));
  if (fs.existsSync(path.join(dataDir, SECRET_FILE))) paths.push(path.join("data", SECRET_FILE));
  if (fs.existsSync(path.join(root, "uploads"))) paths.push("uploads");
  return paths;
}

function createArchive(root) {
  const paths = archivePaths(root);
  if (!paths.includes(path.join("data", DB_FILE))) throw new Error("Database file not found");
  const tmp = path.join(os.tmpdir(), "aamart-backup-" + process.pid + "-" + Date.now() + ".tar.gz");
  execFileSync("tar", ["-czf", tmp, "-C", root, ...paths], { stdio: "pipe" });
  return tmp;
}

async function uploadArchive(file) {
  const res = await fetch(objectUrl(), {
    method: "POST",
    headers: headers({
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    }),
    body: fs.readFileSync(file),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Cloud backup upload failed (" + res.status + "): " + text.slice(0, 300));
  }
}

function isWriteSql(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(String(sql || ""));
}

function schedule(delay) {
  if (!enabled() || !dbRef || shuttingDown) return;
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush(false);
  }, delay == null ? 5000 : delay);
  if (timer.unref) timer.unref();
}

async function flush(waitForCurrent) {
  if (!enabled() || !dbRef) return;

  if (running) {
    if (!waitForCurrent) {
      pending = true;
      return;
    }
    while (running) await new Promise((resolve) => setTimeout(resolve, 100));
    if (!dirty) return;
  }

  if (!dirty) return;
  running = true;
  dirty = false;
  let tmp = null;

  try {
    try { dbRef.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch (e) {
      console.error("[AAMART] Cloud backup checkpoint failed:", e.message);
    }
    tmp = createArchive(rootRef);
    await uploadArchive(tmp);
    console.log("[AAMART] Cloud backup uploaded.");
  } catch (e) {
    dirty = true;
    console.error("[AAMART] Cloud backup failed:", e.message);
  } finally {
    if (tmp) {
      try { fs.rmSync(tmp, { force: true }); } catch {}
    }
    running = false;
    if (pending) {
      pending = false;
      schedule(1000);
    } else if (dirty) {
      schedule(15000);
    }
  }
}

function attach(options) {
  dbRef = options.db;
  rootRef = options.root;

  if (!enabled()) {
    console.log("[AAMART] Cloud backup disabled. Data will not survive a Render restart.");
    return;
  }

  const originalPrepare = dbRef.prepare.bind(dbRef);
  dbRef.prepare = function (sql) {
    const statement = originalPrepare(sql);
    if (isWriteSql(sql)) {
      const originalRun = statement.run.bind(statement);
      statement.run = function (...args) {
        const result = originalRun(...args);
        schedule();
        return result;
      };
    }
    return statement;
  };

  const originalExec = dbRef.exec.bind(dbRef);
  dbRef.exec = function (sql) {
    const result = originalExec(sql);
    if (isWriteSql(sql)) schedule();
    return result;
  };

  schedule(1500);
  interval = setInterval(() => {
    if (dirty) void flush(false);
  }, 60000);
  if (interval.unref) interval.unref();
}

async function keepAlive() {
  if (!enabled()) return;
  const now = Date.now();
  if (now - lastKeepAlive < 60 * 60 * 1000) return;
  lastKeepAlive = now;
  try {
    const res = await fetch(supabaseUrl() + "/storage/v1/bucket/" + encodeURIComponent(bucket()), {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 404) {
      console.error("[AAMART] Supabase keep-alive failed with status " + res.status);
    }
  } catch (e) {
    console.error("[AAMART] Supabase keep-alive failed:", e.message);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[AAMART] " + signal + " received. Flushing cloud backup...");
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (interval) clearInterval(interval);
  dirty = true;
  await Promise.race([
    flush(true),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  process.exit(0);
}

if (enabled()) {
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
}

module.exports = {
  enabled,
  restore,
  attach,
  keepAlive,
  flush,
  bucket,
};

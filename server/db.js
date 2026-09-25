import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const photosDir = path.join(dataDir, "photos");

function nowIso() {
  return new Date().toISOString();
}

function extensionFor(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function writeDiskCopy(itemId, mimeType, data) {
  fs.mkdirSync(photosDir, { recursive: true });
  const filePath = path.join(photosDir, `${itemId}.${extensionFor(mimeType)}`);
  fs.writeFileSync(filePath, data);
  return filePath;
}

function removeDiskCopy(itemId) {
  if (!fs.existsSync(photosDir)) return;
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
    const filePath = path.join(photosDir, `${itemId}.${ext}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function toBuffer(data) {
  if (!data) return data;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data);
}

async function createPostgres(databaseUrl) {
  const { default: pg } = await import("pg");
  const { Pool } = pg;
  const needsSsl =
    !/railway\.internal/i.test(databaseUrl) &&
    (/\b(amazonaws\.com|rlwy\.net|railway\.app|render\.com|neon\.tech|supabase)\b/i.test(
      databaseUrl
    ) ||
      process.env.PGSSLMODE === "require");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS packaging_photos (
      item_id TEXT PRIMARY KEY,
      sku TEXT,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS menu_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT
    );
    CREATE TABLE IF NOT EXISTS wolt_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cooldown_until TIMESTAMPTZ,
      last_error TEXT,
      last_attempt_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    ALTER TABLE packaging_photos ADD COLUMN IF NOT EXISTS original_name TEXT;
  `);

  return {
    driver: "postgres",
    async getPhoto(itemId) {
      const { rows } = await pool.query(
        "SELECT item_id, sku, mime_type, original_name, data, updated_at FROM packaging_photos WHERE item_id = $1",
        [itemId]
      );
      const row = rows[0];
      if (!row) return null;
      return { ...row, data: toBuffer(row.data) };
    },
    async savePhoto({ itemId, sku, mimeType, originalName, data }) {
      const buffer = toBuffer(data);
      await pool.query(
        `INSERT INTO packaging_photos (item_id, sku, mime_type, original_name, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (item_id) DO UPDATE SET
           sku = EXCLUDED.sku,
           mime_type = EXCLUDED.mime_type,
           original_name = EXCLUDED.original_name,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [itemId, sku ?? null, mimeType, originalName ?? null, buffer]
      );
      return { storedIn: "postgres" };
    },
    async deletePhoto(itemId) {
      await pool.query("DELETE FROM packaging_photos WHERE item_id = $1", [itemId]);
    },
    async listPhotoItemIds() {
      const { rows } = await pool.query("SELECT item_id FROM packaging_photos");
      return rows.map((row) => row.item_id);
    },
    async getPhotoMeta(itemId) {
      const { rows } = await pool.query(
        "SELECT item_id, sku, mime_type, original_name, updated_at, octet_length(data) AS bytes FROM packaging_photos WHERE item_id = $1",
        [itemId]
      );
      return rows[0] ?? null;
    },
    async getMenuCache() {
      const { rows } = await pool.query(
        "SELECT payload, fetched_at, status FROM menu_cache WHERE id = 1"
      );
      const row = rows[0];
      if (!row) return null;
      return {
        items: JSON.parse(row.payload),
        fetchedAt: row.fetched_at,
        status: row.status,
      };
    },
    async saveMenuCache({ items, status }) {
      await pool.query(
        `INSERT INTO menu_cache (id, payload, fetched_at, status)
         VALUES (1, $1, NOW(), $2)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload,
           fetched_at = NOW(),
           status = EXCLUDED.status`,
        [JSON.stringify(items), status ?? "READY"]
      );
    },
    async getWoltMeta() {
      const { rows } = await pool.query(
        "SELECT cooldown_until, last_error, last_attempt_at FROM wolt_meta WHERE id = 1"
      );
      const row = rows[0];
      if (!row) return null;
      return {
        cooldownUntil: row.cooldown_until,
        lastError: row.last_error,
        lastAttemptAt: row.last_attempt_at,
      };
    },
    async saveWoltMeta({ cooldownUntil, lastError }) {
      await pool.query(
        `INSERT INTO wolt_meta (id, cooldown_until, last_error, last_attempt_at)
         VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET
           cooldown_until = EXCLUDED.cooldown_until,
           last_error = EXCLUDED.last_error,
           last_attempt_at = NOW()`,
        [cooldownUntil ?? null, lastError ?? null]
      );
    },
  };
}

async function createSqlite() {
  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    throw new Error(
      "SQLite is unavailable. Set DATABASE_URL to a Postgres instance (Railway Postgres) or install better-sqlite3 locally."
    );
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(photosDir, { recursive: true });
  const db = new Database(path.join(dataDir, "woltfetch.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS packaging_photos (
      item_id TEXT PRIMARY KEY,
      sku TEXT,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      status TEXT
    );
    CREATE TABLE IF NOT EXISTS wolt_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cooldown_until TEXT,
      last_error TEXT,
      last_attempt_at TEXT
    );
  `);

  const columns = db.prepare("PRAGMA table_info(packaging_photos)").all();
  if (!columns.some((column) => column.name === "original_name")) {
    db.exec("ALTER TABLE packaging_photos ADD COLUMN original_name TEXT");
  }

  const getPhotoStmt = db.prepare(
    "SELECT item_id, sku, mime_type, original_name, data, updated_at FROM packaging_photos WHERE item_id = ?"
  );
  const getMetaStmt = db.prepare(
    "SELECT item_id, sku, mime_type, original_name, updated_at, length(data) AS bytes FROM packaging_photos WHERE item_id = ?"
  );
  const upsertPhotoStmt = db.prepare(`
    INSERT INTO packaging_photos (item_id, sku, mime_type, original_name, data, updated_at)
    VALUES (@item_id, @sku, @mime_type, @original_name, @data, @updated_at)
    ON CONFLICT(item_id) DO UPDATE SET
      sku = excluded.sku,
      mime_type = excluded.mime_type,
      original_name = excluded.original_name,
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  const deletePhotoStmt = db.prepare("DELETE FROM packaging_photos WHERE item_id = ?");
  const listPhotoIdsStmt = db.prepare("SELECT item_id FROM packaging_photos");
  const getMenuStmt = db.prepare("SELECT payload, fetched_at, status FROM menu_cache WHERE id = 1");
  const upsertMenuStmt = db.prepare(`
    INSERT INTO menu_cache (id, payload, fetched_at, status)
    VALUES (1, @payload, @fetched_at, @status)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      status = excluded.status
  `);
  const getWoltMetaStmt = db.prepare(
    "SELECT cooldown_until, last_error, last_attempt_at FROM wolt_meta WHERE id = 1"
  );
  const upsertWoltMetaStmt = db.prepare(`
    INSERT INTO wolt_meta (id, cooldown_until, last_error, last_attempt_at)
    VALUES (1, @cooldown_until, @last_error, @last_attempt_at)
    ON CONFLICT(id) DO UPDATE SET
      cooldown_until = excluded.cooldown_until,
      last_error = excluded.last_error,
      last_attempt_at = excluded.last_attempt_at
  `);

  return {
    driver: "sqlite",
    async getPhoto(itemId) {
      const row = getPhotoStmt.get(itemId);
      if (!row) return null;
      return { ...row, data: toBuffer(row.data) };
    },
    async savePhoto({ itemId, sku, mimeType, originalName, data }) {
      const buffer = toBuffer(data);
      upsertPhotoStmt.run({
        item_id: itemId,
        sku: sku ?? null,
        mime_type: mimeType,
        original_name: originalName ?? null,
        data: buffer,
        updated_at: nowIso(),
      });
      writeDiskCopy(itemId, mimeType, buffer);
      return { storedIn: "sqlite+disk" };
    },
    async deletePhoto(itemId) {
      deletePhotoStmt.run(itemId);
      removeDiskCopy(itemId);
    },
    async listPhotoItemIds() {
      return listPhotoIdsStmt.all().map((row) => row.item_id);
    },
    async getPhotoMeta(itemId) {
      return getMetaStmt.get(itemId) ?? null;
    },
    async getMenuCache() {
      const row = getMenuStmt.get();
      if (!row) return null;
      return {
        items: JSON.parse(row.payload),
        fetchedAt: row.fetched_at,
        status: row.status,
      };
    },
    async saveMenuCache({ items, status }) {
      upsertMenuStmt.run({
        payload: JSON.stringify(items),
        fetched_at: nowIso(),
        status: status ?? "READY",
      });
    },
    async getWoltMeta() {
      const row = getWoltMetaStmt.get();
      if (!row) return null;
      return {
        cooldownUntil: row.cooldown_until,
        lastError: row.last_error,
        lastAttemptAt: row.last_attempt_at,
      };
    },
    async saveWoltMeta({ cooldownUntil, lastError }) {
      upsertWoltMetaStmt.run({
        cooldown_until: cooldownUntil ?? null,
        last_error: lastError ?? null,
        last_attempt_at: nowIso(),
      });
    },
  };
}

export async function createDb() {
  if (process.env.DATABASE_URL) {
    return createPostgres(process.env.DATABASE_URL);
  }
  return createSqlite();
}

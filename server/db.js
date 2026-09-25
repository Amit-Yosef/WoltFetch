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

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function diskCopyPath(itemId, slot, ext) {
  return path.join(photosDir, `${itemId}-${slot}.${ext}`);
}

function writeDiskCopy(itemId, slot, mimeType, data) {
  fs.mkdirSync(photosDir, { recursive: true });
  removeDiskCopy(itemId, slot);
  const filePath = diskCopyPath(itemId, slot, extensionFor(mimeType));
  fs.writeFileSync(filePath, data);
  return filePath;
}

function removeDiskCopy(itemId, slot) {
  if (!fs.existsSync(photosDir)) return;
  for (const ext of PHOTO_EXTENSIONS) {
    const filePath = diskCopyPath(itemId, slot, ext);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function relocateLegacyDiskCopy(itemId) {
  if (!fs.existsSync(photosDir)) return;
  for (const ext of PHOTO_EXTENSIONS) {
    const from = path.join(photosDir, `${itemId}.${ext}`);
    const to = diskCopyPath(itemId, 0, ext);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
  }
}

function toBuffer(data) {
  if (!data) return data;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data);
}

function mapPhotoMeta(row) {
  return {
    slot: row.slot,
    mimeType: row.mime_type,
    originalName: row.original_name,
    updatedAt: row.updated_at,
    bytes: row.bytes,
  };
}

async function ensurePostgresPhotoKey(pool) {
  const { rows } = await pool.query(`
    SELECT tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = current_schema()
      AND tc.table_name = 'packaging_photos'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `);
  const columns = rows.map((row) => row.column_name);
  if (columns.includes("item_id") && columns.includes("slot")) return;
  const constraint = rows[0]?.constraint_name;
  if (!constraint || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(constraint)) {
    throw new Error("Could not update packaging_photos primary key");
  }
  await pool.query(`ALTER TABLE packaging_photos DROP CONSTRAINT ${constraint}`);
  await pool.query("ALTER TABLE packaging_photos ADD PRIMARY KEY (item_id, slot)");
}

function ensureSqlitePhotoSlots(db) {
  const columns = db.prepare("PRAGMA table_info(packaging_photos)").all();
  const itemCol = columns.find((column) => column.name === "item_id");
  const slotCol = columns.find((column) => column.name === "slot");
  if (itemCol?.pk && slotCol?.pk) return;

  const hasSlot = Boolean(slotCol);
  db.exec(`
    CREATE TABLE packaging_photos_next (
      item_id TEXT NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      sku TEXT,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id, slot)
    );
  `);
  if (hasSlot) {
    db.exec(`
      INSERT INTO packaging_photos_next (item_id, slot, sku, mime_type, original_name, data, updated_at)
      SELECT item_id, slot, sku, mime_type, original_name, data, updated_at FROM packaging_photos
    `);
  } else {
    db.exec(`
      INSERT INTO packaging_photos_next (item_id, slot, sku, mime_type, original_name, data, updated_at)
      SELECT item_id, 0, sku, mime_type, original_name, data, updated_at FROM packaging_photos
    `);
  }
  db.exec(`
    DROP TABLE packaging_photos;
    ALTER TABLE packaging_photos_next RENAME TO packaging_photos;
  `);
  const ids = db.prepare("SELECT DISTINCT item_id FROM packaging_photos").all();
  for (const row of ids) relocateLegacyDiskCopy(row.item_id);
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
      item_id TEXT NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      sku TEXT,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (item_id, slot)
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
  await pool.query(`
    ALTER TABLE packaging_photos ADD COLUMN IF NOT EXISTS slot INTEGER NOT NULL DEFAULT 0;
  `);
  await ensurePostgresPhotoKey(pool);

  return {
    driver: "postgres",
    async getPhoto(itemId, slot = 0) {
      const { rows } = await pool.query(
        "SELECT item_id, slot, sku, mime_type, original_name, data, updated_at FROM packaging_photos WHERE item_id = $1 AND slot = $2",
        [itemId, slot]
      );
      const row = rows[0];
      if (!row) return null;
      return { ...row, data: toBuffer(row.data) };
    },
    async listItemPhotos(itemId) {
      const { rows } = await pool.query(
        `SELECT slot, mime_type, original_name, updated_at, octet_length(data) AS bytes
         FROM packaging_photos WHERE item_id = $1 ORDER BY slot`,
        [itemId]
      );
      return rows.map(mapPhotoMeta);
    },
    async savePhoto({ itemId, slot, sku, mimeType, originalName, data }) {
      const buffer = toBuffer(data);
      await pool.query(
        `INSERT INTO packaging_photos (item_id, slot, sku, mime_type, original_name, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (item_id, slot) DO UPDATE SET
           sku = EXCLUDED.sku,
           mime_type = EXCLUDED.mime_type,
           original_name = EXCLUDED.original_name,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [itemId, slot, sku ?? null, mimeType, originalName ?? null, buffer]
      );
      return { storedIn: "postgres" };
    },
    async deletePhoto(itemId, slot) {
      await pool.query("DELETE FROM packaging_photos WHERE item_id = $1 AND slot = $2", [
        itemId,
        slot,
      ]);
    },
    async listPhotoSummaries() {
      const { rows } = await pool.query(
        "SELECT item_id, slot, updated_at FROM packaging_photos ORDER BY item_id, slot"
      );
      return rows.map((row) => ({
        itemId: row.item_id,
        slot: row.slot,
        updatedAt: row.updated_at,
      }));
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
      item_id TEXT NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      sku TEXT,
      mime_type TEXT NOT NULL,
      original_name TEXT,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id, slot)
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
  ensureSqlitePhotoSlots(db);

  const getPhotoStmt = db.prepare(
    "SELECT item_id, slot, sku, mime_type, original_name, data, updated_at FROM packaging_photos WHERE item_id = ? AND slot = ?"
  );
  const listItemPhotosStmt = db.prepare(
    "SELECT slot, mime_type, original_name, updated_at, length(data) AS bytes FROM packaging_photos WHERE item_id = ? ORDER BY slot"
  );
  const upsertPhotoStmt = db.prepare(`
    INSERT INTO packaging_photos (item_id, slot, sku, mime_type, original_name, data, updated_at)
    VALUES (@item_id, @slot, @sku, @mime_type, @original_name, @data, @updated_at)
    ON CONFLICT(item_id, slot) DO UPDATE SET
      sku = excluded.sku,
      mime_type = excluded.mime_type,
      original_name = excluded.original_name,
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  const deletePhotoStmt = db.prepare("DELETE FROM packaging_photos WHERE item_id = ? AND slot = ?");
  const listSummariesStmt = db.prepare(
    "SELECT item_id, slot, updated_at FROM packaging_photos ORDER BY item_id, slot"
  );
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
    async getPhoto(itemId, slot = 0) {
      const row = getPhotoStmt.get(itemId, slot);
      if (!row) return null;
      return { ...row, data: toBuffer(row.data) };
    },
    async listItemPhotos(itemId) {
      return listItemPhotosStmt.all(itemId).map(mapPhotoMeta);
    },
    async savePhoto({ itemId, slot, sku, mimeType, originalName, data }) {
      const buffer = toBuffer(data);
      upsertPhotoStmt.run({
        item_id: itemId,
        slot,
        sku: sku ?? null,
        mime_type: mimeType,
        original_name: originalName ?? null,
        data: buffer,
        updated_at: nowIso(),
      });
      writeDiskCopy(itemId, slot, mimeType, buffer);
      return { storedIn: "sqlite+disk" };
    },
    async deletePhoto(itemId, slot) {
      deletePhotoStmt.run(itemId, slot);
      removeDiskCopy(itemId, slot);
    },
    async listPhotoSummaries() {
      return listSummariesStmt.all().map((row) => ({
        itemId: row.item_id,
        slot: row.slot,
        updatedAt: row.updated_at,
      }));
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

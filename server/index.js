import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import { createDb } from "./db.js";
import { fetchWoltMenu } from "./wolt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const CACHE_TTL_MS = 30 * 60 * 1000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("ניתן להעלות רק תמונות JPEG, PNG, WebP או GIF"));
  },
});

const db = await createDb();
const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function cacheAgeMs(fetchedAt) {
  if (!fetchedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - new Date(fetchedAt).getTime();
}

async function readMenu({ force = false } = {}) {
  const cached = await db.getMenuCache();
  const fresh = cached && cacheAgeMs(cached.fetchedAt) < CACHE_TTL_MS;

  if (!force && fresh) {
    return {
      items: cached.items,
      fetchedAt: cached.fetchedAt,
      status: cached.status || "READY",
      cached: true,
    };
  }

  try {
    const result = await fetchWoltMenu({ force });
    await db.saveMenuCache({ items: result.items, status: result.status });
    const saved = await db.getMenuCache();
    return {
      items: result.items,
      fetchedAt: saved?.fetchedAt,
      status: result.status,
      cached: false,
    };
  } catch (error) {
    if (cached?.items?.length) {
      return {
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        status: cached.status || "READY",
        cached: true,
        warning: error.message,
        pending: error.code === "MENU_PENDING",
      };
    }
    throw error;
  }
}

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    db: db.driver,
    venueId: process.env.WOLT_VENUE_ID || null,
  });
});

app.get("/api/menu", async (req, res) => {
  try {
    const force = req.query.refresh === "1" || req.query.refresh === "true";
    const menu = await readMenu({ force });
    const photoItemIds = await db.listPhotoItemIds();
    res.json({
      ...menu,
      photoItemIds,
      count: menu.items.length,
    });
  } catch (error) {
    const status =
      error.code === "RATE_LIMITED" ? 429 : error.code === "MENU_PENDING" ? 202 : 502;
    res.status(status).json({
      error: error.message,
      code: error.code || "WOLT_ERROR",
    });
  }
});

app.get("/api/items/:id/photo", async (req, res) => {
  const photo = await db.getPhoto(req.params.id);
  if (!photo) {
    res.status(404).json({ error: "אין תמונת אריזה לפריט זה" });
    return;
  }
  res.setHeader("Content-Type", photo.mime_type);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.send(photo.data);
});

app.put("/api/items/:id/photo", (req, res) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "לא נבחרה תמונה" });
      return;
    }
    try {
      const saved = await db.savePhoto({
        itemId: req.params.id,
        sku: typeof req.body?.sku === "string" ? req.body.sku : null,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        data: req.file.buffer,
      });
      const meta = await db.getPhotoMeta(req.params.id);
      res.json({
        ok: true,
        itemId: req.params.id,
        storedIn: saved?.storedIn || db.driver,
        bytes: meta?.bytes ?? req.file.size,
        mimeType: req.file.mimetype,
        updatedAt: meta?.updated_at,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "שמירת התמונה במסד נכשלה" });
    }
  });
});

app.get("/api/items/:id/photo-meta", async (req, res) => {
  const meta = await db.getPhotoMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    itemId: meta.item_id,
    sku: meta.sku,
    mimeType: meta.mime_type,
    originalName: meta.original_name,
    bytes: meta.bytes,
    updatedAt: meta.updated_at,
  });
});

app.delete("/api/items/:id/photo", async (req, res) => {
  await db.deletePhoto(req.params.id);
  res.json({ ok: true });
});

const distDir = path.join(__dirname, "..", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`WoltFetch API listening on ${PORT} (${db.driver})`);
});

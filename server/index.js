import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import { createDb } from "./db.js";
import { fetchWoltMenu } from "./wolt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const MAX_PACKAGING_PHOTOS = 3;
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
let menuInflight = null;
let menuRetryTimer = null;

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function cooldownRemainingMs(meta) {
  if (!meta?.cooldownUntil) return 0;
  return Math.max(0, new Date(meta.cooldownUntil).getTime() - Date.now());
}

function groupPhotoSlots(summaries) {
  const photoSlots = {};
  for (const row of summaries) {
    if (!photoSlots[row.itemId]) photoSlots[row.itemId] = [];
    photoSlots[row.itemId].push({ slot: row.slot, updatedAt: row.updatedAt });
  }
  return photoSlots;
}

async function cachedPayload(cached, extra = {}) {
  const photoSlots = groupPhotoSlots(await db.listPhotoSummaries());
  return {
    items: cached?.items || [],
    fetchedAt: cached?.fetchedAt || null,
    status: cached?.status || "READY",
    cached: Boolean(cached?.items?.length),
    photoItemIds: Object.keys(photoSlots),
    photoSlots,
    count: cached?.items?.length || 0,
    ...extra,
  };
}

async function readMenuInner({ force = false } = {}) {
  const cached = await db.getMenuCache();
  const hasItems = Boolean(cached?.items?.length);
  const meta = await db.getWoltMeta();
  const waitMs = cooldownRemainingMs(meta);

  if (hasItems && !force) {
    return cachedPayload(cached);
  }

  if (waitMs > 0) {
    return cachedPayload(cached, {
      warning: meta?.lastError || "וולט מגביל את קצב משיכת התפריט. נסו שוב בעוד דקה-שתיים.",
      retryAfterSeconds: Math.ceil(waitMs / 1000),
    });
  }

    try {
      const result = await fetchWoltMenu({ force });
      await db.saveMenuCache({ items: result.items, status: result.status });
      await db.saveWoltMeta({ cooldownUntil: null, lastError: null });
      if (menuRetryTimer) {
        clearTimeout(menuRetryTimer);
        menuRetryTimer = null;
      }
    const saved = await db.getMenuCache();
    return cachedPayload(saved, { cached: false });
  } catch (error) {
    const retryAfterMs = error.retryAfterMs || 120_000;
    await db.saveWoltMeta({
      cooldownUntil: new Date(Date.now() + retryAfterMs).toISOString(),
      lastError: error.message,
    });
    if (!hasItems) {
      scheduleMenuRetry(retryAfterMs + 1000);
    }
    if (hasItems) {
      return cachedPayload(cached, {
        warning: error.message,
        pending: error.code === "MENU_PENDING",
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      });
    }
    return cachedPayload(null, {
      warning: error.message,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    });
  }
}

function scheduleMenuRetry(ms) {
  if (menuRetryTimer) return;
  menuRetryTimer = setTimeout(() => {
    menuRetryTimer = null;
    readMenu({ force: false }).catch((error) => {
      console.error("scheduled menu retry failed", error.message);
    });
  }, ms);
  console.log(`Scheduled Wolt menu retry in ${Math.ceil(ms / 1000)}s`);
}

async function readMenu(options) {
  if (menuInflight) return menuInflight;
  menuInflight = readMenuInner(options).finally(() => {
    menuInflight = null;
  });
  return menuInflight;
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
    res.json(menu);
  } catch (error) {
    res.status(502).json({
      error: error.message,
      code: error.code || "WOLT_ERROR",
      items: [],
    });
  }
});

function parseSlot(raw) {
  const slot = Number(raw);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PACKAGING_PHOTOS) return null;
  return slot;
}

async function nextFreeSlot(itemId) {
  const photos = await db.listItemPhotos(itemId);
  const used = new Set(photos.map((photo) => photo.slot));
  for (let slot = 0; slot < MAX_PACKAGING_PHOTOS; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

async function sendPhoto(req, res) {
  const slot = parseSlot(req.params.slot ?? 0);
  if (slot === null) {
    res.status(400).json({ error: "מספר תמונה לא תקין" });
    return;
  }
  const photo = await db.getPhoto(req.params.id, slot);
  if (!photo) {
    res.status(404).json({ error: "אין תמונת אריזה לפריט זה" });
    return;
  }
  res.setHeader("Content-Type", photo.mime_type);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.send(photo.data);
}

function receivePhoto(resolveSlot) {
  return (req, res) => {
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
        const slot = await resolveSlot(req);
        if (slot === null) {
          res.status(400).json({ error: "אפשר לשמור עד 3 תמונות אריזה לפריט" });
          return;
        }
        if (slot === undefined) {
          res.status(400).json({ error: "מספר תמונה לא תקין" });
          return;
        }
        const saved = await db.savePhoto({
          itemId: req.params.id,
          slot,
          sku: typeof req.body?.sku === "string" ? req.body.sku : null,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
          data: req.file.buffer,
        });
        const photos = await db.listItemPhotos(req.params.id);
        const current = photos.find((photo) => photo.slot === slot);
        res.json({
          ok: true,
          itemId: req.params.id,
          slot,
          photos,
          storedIn: saved?.storedIn || db.driver,
          bytes: current?.bytes ?? req.file.size,
          mimeType: req.file.mimetype,
          updatedAt: current?.updatedAt,
        });
      } catch (error) {
        res.status(500).json({ error: error.message || "שמירת התמונה במסד נכשלה" });
      }
    });
  };
}

app.get("/api/items/:id/photos", async (req, res) => {
  const photos = await db.listItemPhotos(req.params.id);
  res.json({ photos });
});

app.get("/api/items/:id/photos/:slot", sendPhoto);
app.get("/api/items/:id/photo", sendPhoto);

app.put(
  "/api/items/:id/photos",
  receivePhoto(async (req) => nextFreeSlot(req.params.id))
);
app.put(
  "/api/items/:id/photos/:slot",
  receivePhoto(async (req) => {
    const slot = parseSlot(req.params.slot);
    return slot === null ? undefined : slot;
  })
);
app.put(
  "/api/items/:id/photo",
  receivePhoto(async () => 0)
);

app.get("/api/items/:id/photo-meta", async (req, res) => {
  const photos = await db.listItemPhotos(req.params.id);
  if (!photos.length) {
    res.status(404).json({ exists: false, photos: [] });
    return;
  }
  res.json({ exists: true, itemId: req.params.id, photos });
});

app.delete("/api/items/:id/photos/:slot", async (req, res) => {
  const slot = parseSlot(req.params.slot);
  if (slot === null) {
    res.status(400).json({ error: "מספר תמונה לא תקין" });
    return;
  }
  await db.deletePhoto(req.params.id, slot);
  res.json({ ok: true, photos: await db.listItemPhotos(req.params.id) });
});

app.delete("/api/items/:id/photo", async (req, res) => {
  await db.deletePhoto(req.params.id, 0);
  res.json({ ok: true, photos: await db.listItemPhotos(req.params.id) });
});

const distDir = path.join(__dirname, "..", "dist");
const indexHtml = path.join(distDir, "index.html");
const hasFrontend = fs.existsSync(indexHtml);

if (hasFrontend) {
  app.use(express.static(distDir));
  app.get("/", (_req, res) => {
    res.sendFile(indexHtml);
  });
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(503)
      .type("html")
      .send(
        "<!doctype html><meta charset='utf-8'><body dir='rtl' lang='he'><p>השרת רץ, אבל קבצי הממשק לא נבנו. צריך <code>npm run build</code> לפני העלאה.</p></body>"
      );
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `WoltFetch listening on ${PORT} (${db.driver})${hasFrontend ? ", frontend=dist" : ", frontend missing"}`
  );
});

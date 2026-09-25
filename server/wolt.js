const DEFAULT_BASE = "https://pos-integration-service.wolt.com";
const POLL_MS = 15_000;
const MAX_POLLS = 12;

function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function pickLocalized(entries, lang = "he") {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const match =
    entries.find((entry) => entry?.lang === lang) ||
    entries.find((entry) => entry?.lang === "en") ||
    entries[0];
  return String(match?.value ?? "").replace(/\u202b|\u202c|\u200f|\u200e/g, "").trim();
}

export function flattenMenu(menu) {
  const categories = Array.isArray(menu?.categories) ? menu.categories : [];
  const items = Array.isArray(menu?.items) ? menu.items : [];

  const categoryNamesByItem = new Map();
  for (const category of categories) {
    const name = pickLocalized(category.name);
    for (const binding of category.item_bindings || []) {
      const itemId = binding.item_id;
      if (!itemId) continue;
      const current = categoryNamesByItem.get(itemId) || [];
      if (name && !current.includes(name)) current.push(name);
      categoryNamesByItem.set(itemId, current);
    }
  }

  return items.map((item) => {
    const product = item.product || {};
    return {
      id: item.id,
      name: pickLocalized(product.name || item.name),
      sku: String(product.sku || item.merchant_sku || product.external_id || "").trim(),
      imageUrl: product.image_url || item.image_url || "",
      categories: categoryNamesByItem.get(item.id) || [],
      enabled: item.enabled?.enabled !== false,
    };
  });
}

async function fetchJson(url, { headers, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollResourceUrl(resourceUrl) {
  let last = null;
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const { response, body } = await fetchJson(resourceUrl, { timeoutMs: 60_000 });
    if (!response.ok) {
      throw new Error(`משיכת התפריט נכשלה (${response.status})`);
    }
    last = body;
    const status = String(body?.status || "").toUpperCase();
    if (status === "READY" && body?.menu) {
      return body;
    }
    if (attempt < MAX_POLLS - 1) {
      await sleep(POLL_MS);
    }
  }
  const status = last?.status || "UNKNOWN";
  const error = new Error(`התפריט עדיין לא מוכן (${status}). נסו שוב בעוד דקה.`);
  error.code = "MENU_PENDING";
  error.status = status;
  throw error;
}

export async function fetchWoltMenu({ force = false } = {}) {
  const username = process.env.WOLT_USERNAME;
  const password = process.env.WOLT_PASSWORD;
  const venueId = process.env.WOLT_VENUE_ID;
  const baseUrl = (process.env.WOLT_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

  if (!username || !password || !venueId) {
    throw new Error("חסרים פרטי התחברות לוולט. בדקו את משתני הסביבה.");
  }

  const url = `${baseUrl}/v2/venues/${venueId}/menu`;
  const headers = {
    Authorization: basicAuthHeader(username, password),
    Accept: "application/json",
  };

  const { response, body } = await fetchJson(url, { headers });

  if (response.status === 429) {
    const error = new Error("וולט הגביל את קצב המשיכות. משתמשים במטמון אם קיים.");
    error.code = "RATE_LIMITED";
    error.statusCode = 429;
    throw error;
  }

  if (!response.ok && response.status !== 202) {
    const detail = typeof body === "object" ? JSON.stringify(body) : String(body || "");
    throw new Error(`קריאת וולט נכשלה (${response.status}) ${detail}`.trim());
  }

  if (body?.resource_url) {
    const ready = await pollResourceUrl(body.resource_url);
    return {
      status: ready.status || "READY",
      items: flattenMenu(ready.menu),
      requestId: ready.request_id || body.request_id,
      forced: force,
    };
  }

  if (body?.status && String(body.status).toUpperCase() !== "READY") {
    const error = new Error("התפריט עדיין לא מוכן. נסו שוב בעוד דקה.");
    error.code = "MENU_PENDING";
    error.status = body.status;
    throw error;
  }

  const menu = body?.menu || body;
  return {
    status: body?.status || "READY",
    items: flattenMenu(menu),
    requestId: body?.request_id,
    forced: force,
  };
}

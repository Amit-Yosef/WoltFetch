export async function fetchMenu({ refresh = false } = {}) {
  const url = refresh ? "/api/menu?refresh=1" : "/api/menu";
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (Array.isArray(body.items)) {
    return body;
  }
  if (!response.ok) {
    throw new Error(body.error || body.warning || "טעינת התפריט נכשלה");
  }
  return body;
}

export const MAX_PACKAGING_PHOTOS = 3;

export function packagingPhotoUrl(itemId, slot, updatedAt) {
  const stamp = updatedAt ? `?t=${encodeURIComponent(String(updatedAt))}` : "";
  return `/api/items/${encodeURIComponent(itemId)}/photos/${slot}${stamp}`;
}

export async function uploadPackagingPhoto(itemId, file, sku, slot) {
  const data = new FormData();
  data.append("photo", file);
  if (sku) data.append("sku", sku);
  const path =
    slot === undefined || slot === null
      ? `/api/items/${encodeURIComponent(itemId)}/photos`
      : `/api/items/${encodeURIComponent(itemId)}/photos/${slot}`;
  const response = await fetch(path, {
    method: "PUT",
    body: data,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "שמירת התמונה בשרת נכשלה");
  }
  return body;
}

export async function saveItemNote(itemId, text, sku) {
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sku: sku || "" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "שמירת ההערה נכשלה");
  }
  return body;
}

export async function deletePackagingPhoto(itemId, slot) {
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/photos/${slot}`, {
    method: "DELETE",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "מחיקת התמונה נכשלה");
  }
  return body;
}

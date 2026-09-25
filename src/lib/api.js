export async function fetchMenu({ refresh = false } = {}) {
  const url = refresh ? "/api/menu?refresh=1" : "/api/menu";
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(body.error || "טעינת התפריט נכשלה");
  }
  return body;
}

export function packagingPhotoUrl(itemId, updatedAt) {
  const stamp = updatedAt ? `?t=${encodeURIComponent(String(updatedAt))}` : `?t=${Date.now()}`;
  return `/api/items/${encodeURIComponent(itemId)}/photo${stamp}`;
}

export async function uploadPackagingPhoto(itemId, file, sku) {
  const data = new FormData();
  data.append("photo", file);
  if (sku) data.append("sku", sku);
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/photo`, {
    method: "PUT",
    body: data,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "שמירת התמונה בשרת נכשלה");
  }
  return body;
}

export async function deletePackagingPhoto(itemId) {
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/photo`, {
    method: "DELETE",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "מחיקת התמונה נכשלה");
  }
  return body;
}

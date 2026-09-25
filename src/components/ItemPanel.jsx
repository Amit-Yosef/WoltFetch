import { useRef, useState } from "react";
import { ImageOff, Upload, X } from "lucide-react";
import { deletePackagingPhoto, packagingPhotoUrl, uploadPackagingPhoto } from "../lib/api.js";

function PhotoFrame({ label, children }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-sm font-medium text-mute">{label}</figcaption>
      <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-band">
        {children}
      </div>
    </figure>
  );
}

export default function ItemPanel({ item, hasPhoto, photoStamp, onClose, onPhotoChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  if (!item) return null;

  async function saveFile(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const saved = await uploadPackagingPhoto(item.id, file, item.sku);
      onPhotoChange(item.id, saved.updatedAt || Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setError("");
    try {
      await deletePackagingPhoto(item.id);
      onPhotoChange(item.id, null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full w-full max-w-none flex-col border-s border-line bg-raised lg:max-w-[28rem]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="sku text-sm text-mute">{item.sku || "ללא מק״ט"}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{item.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-10 items-center justify-center rounded-full text-mute hover:bg-band hover:text-ink"
          aria-label="סגירה"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-2 gap-3">
          <PhotoFrame label="תמונת וולט">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-mute">
                <ImageOff size={28} />
              </div>
            )}
          </PhotoFrame>
          <PhotoFrame label="תמונת אריזה">
            {hasPhoto ? (
              <img
                src={packagingPhotoUrl(item.id, photoStamp)}
                alt={`אריזה של ${item.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-sm text-mute">
                <ImageOff size={22} />
                <span>עדיין לא הועלתה</span>
              </div>
            )}
          </PhotoFrame>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-mute">
          תמונת האריזה נשמרת בשרת המקומי בלבד. היא לא נשלחת לוולט.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            saveFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-4 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors duration-150 ${
            dragOver ? "border-accent bg-accent/8" : "border-line bg-paper"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              saveFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-raised hover:bg-accent-deep disabled:opacity-60"
          >
            <Upload size={16} />
            {hasPhoto ? "החלפת תמונת אריזה" : "העלאת תמונת אריזה"}
          </button>
          <p className="mt-2 text-xs text-mute">JPEG, PNG, WebP או GIF עד 8MB</p>
        </div>

        {hasPhoto ? (
          <button
            type="button"
            disabled={busy}
            onClick={removePhoto}
            className="mt-3 w-full rounded-full px-4 py-2 text-sm text-mute hover:bg-band hover:text-ink disabled:opacity-60"
          >
            הסרת תמונת האריזה
          </button>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl bg-warn/15 px-3 py-2 text-sm text-accent-deep">{error}</p>
        ) : null}

        {item.categories?.length ? (
          <p className="mt-6 text-sm text-mute">{item.categories.join(" · ")}</p>
        ) : null}
      </div>
    </aside>
  );
}

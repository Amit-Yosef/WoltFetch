import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Maximize2, Upload, X } from "lucide-react";
import {
  MAX_PACKAGING_PHOTOS,
  deletePackagingPhoto,
  packagingPhotoUrl,
  uploadPackagingPhoto,
} from "../lib/api.js";
import PhotoViewer from "./PhotoViewer.jsx";

function DeleteConfirm({ label, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") onCancelRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-photo-title"
        className="w-full max-w-sm rounded-2xl border border-line bg-raised p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="delete-photo-title" className="text-lg font-semibold">
          למחוק את התמונה?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          {label} תימחק מהשרת. אי אפשר לשחזר אותה.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-raised hover:bg-accent-deep disabled:opacity-60"
          >
            מחיקה
          </button>
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-band px-4 py-2.5 text-sm font-medium text-ink hover:bg-line disabled:opacity-60"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PhotoFrame({ label, children, className = "" }) {
  return (
    <figure className={`min-w-0 ${className}`}>
      <figcaption className="mb-2 text-sm font-medium text-mute">{label}</figcaption>
      <div className="overflow-hidden rounded-2xl border border-line bg-band">{children}</div>
    </figure>
  );
}

export default function ItemPanel({ item, photos, onClose, onPhotoChange }) {
  const inputRef = useRef(null);
  const slotTarget = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [confirmSlot, setConfirmSlot] = useState(null);

  if (!item) return null;

  const list = Array.isArray(photos) ? photos : [];
  const bySlot = new Map(list.map((photo) => [photo.slot, photo]));
  const full = list.length >= MAX_PACKAGING_PHOTOS;

  function chooseFile(slot) {
    slotTarget.current = slot;
    inputRef.current?.click();
  }

  async function saveFile(file, slot = slotTarget.current) {
    if (!file) return;
    slotTarget.current = null;
    setBusy(true);
    setError("");
    try {
      const saved = await uploadPackagingPhoto(item.id, file, item.sku, slot);
      onPhotoChange(item.id, saved.photos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(slot) {
    setBusy(true);
    setError("");
    try {
      const saved = await deletePackagingPhoto(item.id, slot);
      onPhotoChange(item.id, saved.photos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full w-full max-w-none flex-col border-s border-line bg-raised lg:max-w-[28rem]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="sku text-sm text-mute">{item.sku || "ללא מק״ט"}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug">{item.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-band hover:text-ink"
          aria-label="סגירה"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <PhotoFrame label="תמונת וולט">
          <div className="relative aspect-[4/3] sm:aspect-[5/4]">
            {item.imageUrl ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setViewer({ type: "wolt" });
                }}
                className="h-full w-full cursor-zoom-in"
                aria-label={`הצגת תמונת וולט של ${item.name} במסך מלא`}
              >
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <div className="flex h-full items-center justify-center text-mute">
                <ImageOff size={28} />
              </div>
            )}
            {item.imageUrl ? (
              <span className="pointer-events-none absolute end-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full bg-ink/70 text-raised">
                <Maximize2 size={15} />
              </span>
            ) : null}
          </div>
        </PhotoFrame>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-mute">תמונות אריזה</h3>
            <span className="text-xs text-mute">
              {list.length}/{MAX_PACKAGING_PHOTOS}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: MAX_PACKAGING_PHOTOS }, (_, slot) => {
              const photo = bySlot.get(slot);
              return (
                <div key={slot} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-band">
                  {photo ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setViewer({ type: "pack", slot });
                        }}
                        className="h-full w-full cursor-zoom-in disabled:opacity-60"
                        aria-label={`הצגת תמונת אריזה ${slot + 1} במסך מלא`}
                      >
                        <img
                          src={packagingPhotoUrl(item.id, slot, photo.updatedAt)}
                          alt={`אריזה ${slot + 1} של ${item.name}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmSlot(slot)}
                        className="absolute end-1 top-1 inline-flex size-8 items-center justify-center rounded-full bg-ink/75 text-raised disabled:opacity-60"
                        aria-label={`הסרת תמונת אריזה ${slot + 1}`}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => chooseFile(slot)}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-mute hover:bg-paper disabled:opacity-60"
                      aria-label={`הוספת תמונת אריזה ${slot + 1}`}
                    >
                      <Upload size={16} />
                      <span>{slot + 1}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-mute">
          תמונות האריזה נשמרות בשרת המקומי בלבד. הן לא נשלחות לוולט.
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
            slotTarget.current = null;
            saveFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-4 rounded-2xl border border-dashed px-4 py-4 text-center transition-colors duration-150 sm:py-6 ${
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
            disabled={busy || full}
            onClick={() => chooseFile(null)}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-raised hover:bg-accent-deep disabled:opacity-60"
          >
            <Upload size={16} />
            {list.length ? "הוספת תמונת אריזה" : "העלאת תמונת אריזה"}
          </button>
          <p className="mt-2 text-xs text-mute">
            {full
              ? "יש 3 תמונות. פתחו תמונה כדי להחליף, או הסירו אחת."
              : "JPEG, PNG, WebP או GIF עד 8MB. עד 3 תמונות."}
          </p>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl bg-warn/15 px-3 py-2 text-sm text-accent-deep">{error}</p>
        ) : null}

        {item.categories?.length ? (
          <p className="mt-6 text-sm text-mute">{item.categories.join(" · ")}</p>
        ) : null}
      </div>
      {confirmSlot !== null ? (
        <DeleteConfirm
          label={`תמונת אריזה ${confirmSlot + 1}`}
          busy={busy}
          onCancel={() => {
            if (!busy) setConfirmSlot(null);
          }}
          onConfirm={async () => {
            await removePhoto(confirmSlot);
            setConfirmSlot(null);
          }}
        />
      ) : null}
      {viewer?.type === "wolt" && item.imageUrl ? (
        <PhotoViewer
          src={item.imageUrl}
          alt={item.name}
          caption="תמונת וולט"
          onClose={() => setViewer(null)}
        />
      ) : null}
      {viewer?.type === "pack" && bySlot.get(viewer.slot) ? (
        <PhotoViewer
          src={packagingPhotoUrl(item.id, viewer.slot, bySlot.get(viewer.slot).updatedAt)}
          alt={`אריזה ${viewer.slot + 1} של ${item.name}`}
          caption={`תמונת אריזה ${viewer.slot + 1}`}
          busy={busy}
          error={error}
          onClose={() => setViewer(null)}
          onReplace={(file) => saveFile(file, viewer.slot)}
        />
      ) : null}
    </aside>
  );
}

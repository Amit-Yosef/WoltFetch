import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";

export default function PhotoViewer({ src, alt, caption, busy = false, error = "", onClose, onReplace }) {
  const closeRef = useRef(null);
  const inputRef = useRef(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption || alt || "תמונה"}
      className="fixed inset-0 z-[70] flex flex-col bg-ink text-raised"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm">{caption}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-raised/10"
          aria-label="סגירה"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4" onClick={onClose}>
        <img
          src={src}
          alt={alt || ""}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>

      {onReplace ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {error ? <p className="text-center text-sm text-warn">{error}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onReplace(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-raised hover:bg-accent-deep disabled:opacity-60"
          >
            <Upload size={16} />
            החלפת תמונה
          </button>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>,
    document.body
  );
}

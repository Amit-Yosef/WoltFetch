function Placeholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-band text-mute">
      <span className="text-sm">אין תמונה</span>
    </div>
  );
}

export default function ItemCard({ item, photoCount = 0, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`card-vis group flex w-full flex-col overflow-hidden rounded-xl border bg-raised text-right shadow-[0_1px_0_oklch(0.88_0.02_75)] transition-[border-color,box-shadow] duration-200 ease-out sm:rounded-2xl ${
        selected
          ? "border-accent shadow-[0_0_0_3px_oklch(0.52_0.13_48_/_0.18)]"
          : "border-line hover:border-accent/40"
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-band sm:aspect-[4/5]">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Placeholder />
        )}
        {photoCount > 0 ? (
          <span
            className="absolute start-1.5 top-1.5 rounded-full bg-good px-1.5 py-0.5 text-[10px] font-medium leading-none text-raised sm:start-2.5 sm:top-2.5 sm:px-2 sm:py-1 sm:text-xs"
            aria-label={`${photoCount} מתוך 3 תמונות אריזה`}
          >
            {photoCount}/3
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2 py-2 sm:gap-2 sm:px-3.5 sm:py-3.5">
        <h2 className="line-clamp-2 text-[13px] font-medium leading-snug text-ink sm:text-[15px]">
          {item.name}
        </h2>
        <p className="sku mt-auto text-xs text-mute sm:text-sm">{item.sku || "ללא מק״ט"}</p>
      </div>
    </button>
  );
}

function Placeholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-band text-mute">
      <span className="text-sm">אין תמונה</span>
    </div>
  );
}

export default function ItemCard({ item, hasPhoto, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`card-vis group flex w-full flex-col overflow-hidden rounded-2xl border bg-raised text-right shadow-[0_1px_0_oklch(0.88_0.02_75)] transition-[border-color,box-shadow] duration-200 ease-out ${
        selected
          ? "border-accent shadow-[0_0_0_3px_oklch(0.52_0.13_48_/_0.18)]"
          : "border-line hover:border-accent/40"
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-band">
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
        {hasPhoto ? (
          <span className="absolute start-3 top-3 rounded-full bg-good px-2.5 py-1 text-xs font-medium text-raised">
            יש אריזה
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3.5 py-3.5">
        <h2 className="line-clamp-2 text-[15px] font-medium leading-snug text-ink">{item.name}</h2>
        <p className="sku mt-auto text-sm text-mute">{item.sku || "ללא מק״ט"}</p>
      </div>
    </button>
  );
}

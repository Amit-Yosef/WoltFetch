import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import ItemCard from "./components/ItemCard.jsx";
import ItemPanel from "./components/ItemPanel.jsx";
import { fetchMenu } from "./lib/api.js";

const PAGE = 60;
const cardGrid =
  "grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] md:gap-4";

function matchesQuery(item, query) {
  if (!query) return true;
  const hay = `${item.name} ${item.sku}`.toLowerCase();
  return hay.includes(query);
}

export default function App() {
  const [items, setItems] = useState([]);
  const [photoMap, setPhotoMap] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [meta, setMeta] = useState(null);

  async function load({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await fetchMenu({ refresh });
      setItems(data.items || []);
      setPhotoMap(data.photoSlots || {});
      setMeta({
        count: data.count ?? data.items?.length ?? 0,
        fetchedAt: data.fetchedAt,
        cached: data.cached,
        retryAfterSeconds: data.retryAfterSeconds || 0,
      });
      setWarning(data.warning || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (items.length > 0 || error) return;
    const delay = Math.max((meta?.retryAfterSeconds || 0) * 1000, warning ? 15_000 : 0);
    if (!delay) return;
    const timer = setTimeout(() => load(), delay);
    return () => clearTimeout(timer);
  }, [items.length, error, warning, meta?.retryAfterSeconds]);

  useEffect(() => {
    setVisible(PAGE);
  }, [query, filter]);

  const selected = items.find((item) => item.id === selectedId) || null;
  const photoCount = Object.keys(photoMap).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesQuery(item, q)) return false;
      if (filter === "with" && !photoMap[item.id]) return false;
      if (filter === "without" && photoMap[item.id]) return false;
      return true;
    });
  }, [items, query, filter, photoMap]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-band/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-mute">Home and More</p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">תמונות אריזה</h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-mute">
              <span>
                {meta?.count ?? 0} פריטים · {photoCount} עם אריזה
              </span>
              <button
                type="button"
                onClick={() => load({ refresh: true })}
                disabled={refreshing || Boolean(warning)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-2 text-ink hover:border-accent/50 disabled:opacity-60"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                סנכרון וולט
              </button>
            </div>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-mute" size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי שם או מק״ט"
              className="w-full rounded-2xl border border-line bg-raised py-3 pe-4 ps-12 text-base outline-none placeholder:text-mute/80 sm:py-3.5"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <main className="min-w-0 flex-1 px-3 py-3 sm:px-6 sm:py-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-5">
            {[
              ["all", "הכל"],
              ["without", "בלי תמונת אריזה"],
              ["with", "עם תמונת אריזה"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-10 rounded-full px-3 py-2 text-sm ${
                  filter === id ? "bg-accent text-raised" : "bg-raised text-mute hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {error ? (
            <div className="rounded-2xl border border-accent/30 bg-accent/8 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}
          {warning && !error ? (
            <div className="mb-4 rounded-2xl bg-warn/15 px-4 py-3 text-sm">{warning}</div>
          ) : null}

          {loading ? (
            <div className={cardGrid}>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-xl border border-line bg-raised sm:rounded-2xl">
                  <div className="aspect-square animate-pulse bg-band sm:aspect-[4/5]" />
                  <div className="space-y-2 p-2 sm:p-3.5">
                    <div className="h-3.5 w-4/5 animate-pulse rounded bg-band sm:h-4" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-band" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-line bg-raised px-6 py-16 text-center">
              <p className="text-lg font-medium">
                {warning || error ? "התפריט עדיין לא נטען מוולט" : "לא נמצאו פריטים"}
              </p>
              <p className="mt-2 text-sm text-mute">
                {warning || error
                  ? "וולט מאפשר משיכה אחת לכמה דקות. ממתינים אוטומטית ואז טוענים שוב."
                  : "נסו שם אחר או מק״ט מדויק מהמלאי."}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-mute sm:mb-4">
                {filtered.length === items.length
                  ? `${filtered.length} פריטים`
                  : `${filtered.length} מתוך ${items.length}`}
              </p>
              <div className={cardGrid}>
                {shown.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    photoCount={photoMap[item.id]?.length || 0}
                    selected={item.id === selectedId}
                    onSelect={(next) => setSelectedId(next.id)}
                  />
                ))}
              </div>
              {visible < filtered.length ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisible((count) => count + PAGE)}
                    className="rounded-full border border-line bg-raised px-5 py-2.5 text-sm hover:border-accent/50"
                  >
                    הצגת עוד {Math.min(PAGE, filtered.length - visible)} פריטים
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>

        {selected ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
              aria-label="סגירת פריט"
              onClick={() => setSelectedId(null)}
            />
            <div className="fixed inset-y-0 start-0 z-40 w-full max-w-[28rem] shadow-2xl lg:sticky lg:top-[8.75rem] lg:order-first lg:z-0 lg:h-[calc(100dvh-8.75rem)] lg:max-w-[28rem] lg:shadow-none">
              <ItemPanel
                item={selected}
                photos={photoMap[selected.id] || []}
                onClose={() => setSelectedId(null)}
                onPhotoChange={(id, photos) => {
                  setPhotoMap((current) => {
                    const next = { ...current };
                    if (photos?.length) next[id] = photos;
                    else delete next[id];
                    return next;
                  });
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Squelette léger : l’en-tête et la sous-nav du layout restent en place. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-6 w-32 rounded-lg bg-[var(--admin-peach)]" />
      <div className="h-20 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
      <div className="h-20 rounded-2xl bg-white ring-1 ring-[#e5e3dc]" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="mt-6 animate-pulse space-y-4" aria-hidden>
      <div className="h-4 w-full max-w-xl rounded bg-[#ece9e2]" />
      <div className="flex gap-2">
        <div className="h-8 w-16 rounded-full bg-[var(--admin-navy)]/80" />
        <div className="h-8 w-16 rounded-full bg-[#ece9e2]" />
        <div className="h-8 w-16 rounded-full bg-[#ece9e2]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e3dc]">
            <div className="space-y-2 px-4 py-3.5">
              <div className="h-5 w-2/3 rounded bg-[#ece9e2]" />
              <div className="h-3 w-full rounded bg-[#f1efea]" />
            </div>
            <div className="h-80 bg-[#FAF9F6] sm:h-[22rem]" />
          </div>
        ))}
      </div>
    </div>
  );
}

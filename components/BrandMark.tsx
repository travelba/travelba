export function BrandMark({ className = "h-9 w-9 text-xs" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-[#C5A880] font-semibold tracking-[0.08em] text-[#C5A880] ${className}`}
    >
      TB
    </span>
  );
}

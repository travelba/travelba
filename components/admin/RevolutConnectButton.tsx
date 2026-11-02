"use client";

/** Lance l’OAuth Revolut Business : navigation complète vers la route API, pas une page Next. */
export function RevolutConnectButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route API qui redirige vers l’OAuth Revolut : navigation complète voulue, pas une page
        window.location.assign("/api/admin/revolut/oauth");
      }}
      className={className || "admin-tap inline-flex min-h-10 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white"}
    >
      Connecter Revolut
    </button>
  );
}

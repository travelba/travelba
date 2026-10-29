"use client";

import Link from "next/link";

export function BookingRestaurants({ bookingId }: { bookingId: string }) {
  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <p className="text-sm text-[#0B192C]">Les deux tables du soir se choisissent et s’envoient depuis l’écran Restaurants.</p>
      <Link
        href={`/admin/restaurants#${bookingId}`}
        className="admin-tap inline-flex min-h-11 items-center rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white"
      >
        Ouvrir les restaurants du soir
      </Link>
    </section>
  );
}

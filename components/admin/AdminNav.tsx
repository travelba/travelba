"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  if (pathname === "/admin/login") return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  async function newVoyage() {
    setCreating(true);
    const res = await fetch("/api/admin/mtrip/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nouveau voyage", passengers: [] }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/admin/mtrip/${data.guide.id}`);
  }

  return (
    <nav className="relative flex flex-wrap items-center gap-1.5 text-sm">
      <button
        type="button"
        onClick={newVoyage}
        disabled={creating}
        className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
      >
        {creating ? "…" : "Nouveau voyage"}
      </button>
      <button
        type="button"
        onClick={signOut}
        className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--admin-navy)]/75 transition hover:bg-[var(--admin-sky)] hover:text-[var(--admin-navy)]"
      >
        Déconnexion
      </button>
    </nav>
  );
}

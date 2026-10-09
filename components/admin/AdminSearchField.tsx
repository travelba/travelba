"use client";

import { FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AdminSearchField({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q") || "").trim();
    router.push(q ? `/admin/recherche?q=${encodeURIComponent(q)}` : "/admin/recherche");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6">
      <label className="block text-sm font-semibold text-[var(--admin-navy)]">
        Recherche
        <input
          ref={field}
          name="q"
          defaultValue={initial}
          aria-label="Recherche"
          className="admin-af-input mt-2 w-full"
        />
      </label>
    </form>
  );
}

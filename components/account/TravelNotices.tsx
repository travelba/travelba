"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Notice = { id: string; title: string; message: string; url: string; createdAt?: string };

/** Rappels déjà envoyés : vol, départ, reste à payer. Rien si la liste est vide. */
export function TravelNotices({ preview }: { preview?: Notice[] }) {
  const [notices, setNotices] = useState<Notice[]>(preview || []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetch("/api/client/notices", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? ((await response.json()) as { notices?: Notice[] }) : null))
      .then((body) => {
        if (!cancelled && body?.notices?.length) setNotices(body.notices);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (!notices.length) return null;

  return (
    <section className="rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Pour votre voyage</h2>
      <ul className="mt-2 space-y-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link href={notice.url} className="block rounded-xl bg-[#f8f3eb] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--admin-navy)]">{notice.title}</p>
              <p className="text-xs text-[#3d4654]">{notice.message}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

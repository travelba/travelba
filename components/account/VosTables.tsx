"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientEveningTables, ClientTableCard, ClientTableStatus } from "@/lib/crm/client-tables";

const TONE: Record<ClientTableStatus, string> = {
  proposee: "bg-[#e7e2d8] text-[#5c564c]",
  acceptee: "bg-[#1f6b45] text-white",
  refusee: "bg-[#c46a2d] text-white",
  a_annuler: "bg-[#c46a2d] text-white",
  annulee: "bg-[#d9d1c3] text-[#5c564c]",
};

function TableCard({
  table,
  busy,
  onReply,
}: {
  table: ClientTableCard;
  busy: boolean;
  onReply: (table: ClientTableCard, reply: "accepte" | "refuse") => void;
}) {
  return (
    <article className="overflow-hidden rounded-[1.4rem] bg-white shadow-[0_10px_28px_rgba(11,25,44,0.08)]">
      <div className={`relative aspect-[4/3] ${table.photo ? "" : "bg-gradient-to-br from-[#1a3348] to-[#0B192C]"}`}>
        {table.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={table.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-end p-4 text-sm font-semibold text-[#f4efe4]">Photo à venir</div>
        )}
        <p className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${TONE[table.status]}`}>{table.label}</p>
      </div>
      <div className="space-y-2 px-4 py-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-[#0B192C]">{table.name}</h3>
          <p className="text-sm text-[#5c564c]">{[table.time, "2 couverts"].filter(Boolean).join(" · ")}</p>
        </div>
        {table.pitch ? <p className="text-sm leading-relaxed text-[#0B192C]">{table.pitch}</p> : null}
        {table.price ? <p className="text-sm font-semibold text-[#8c7350]">{table.price} par personne</p> : null}
        {table.address ? <p className="text-sm text-[#5c564c]">{table.address}</p> : null}
        {table.href ? (
          <a href={table.href} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-[#0B192C] underline decoration-[#C5A880] underline-offset-4">
            Voir le site
          </a>
        ) : null}
        {table.canReply ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onReply(table, "accepte")}
              className="min-h-11 rounded-full bg-[#0B192C] text-sm font-semibold text-white disabled:opacity-40"
            >
              Accepter
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReply(table, "refuse")}
              className="min-h-11 rounded-full border border-[#d9d1c3] text-sm font-semibold text-[#0B192C] disabled:opacity-40"
            >
              Refuser
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Tables proposées au client, dans le séjour. Accepter et Refuser suivent le même choix que WhatsApp. */
export function VosTables({
  reference,
  evenings,
  fictional = false,
}: {
  reference: string;
  evenings: ClientEveningTables[];
  /** Aperçu local : les boutons ne touchent pas le CRM. */
  fictional?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!evenings.length) return null;

  async function reply(table: ClientTableCard, action: "accepte" | "refuse") {
    if (fictional) {
      setNote("Aperçu fictif : rien n’est enregistré.");
      return;
    }
    setBusy(table.id);
    setNote("");
    try {
      const response = await fetch(`/api/client/bookings/${encodeURIComponent(reference)}/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: table.date, seat: table.seat, reply: action }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "Choix impossible.");
        return;
      }
      router.refresh();
    } catch {
      setNote("Choix impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="vos-tables" className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Vos tables</p>
        <p className="mt-1 text-sm leading-relaxed text-[#5c564c]">
          Deux tables sont retenues à votre nom pour chaque soirée. Acceptez celle que vous gardez, et refusez l’autre. Sans réponse, elles sont annulées à 18 h.
        </p>
      </div>
      {note ? <p className="text-sm font-semibold text-[#0B192C]">{note}</p> : null}
      {evenings.map((evening) => (
        <div key={evening.date} className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#0B192C]">{evening.label}</h2>
          <div className="space-y-3">
            {evening.tables.map((table) => (
              <TableCard key={table.id} table={table} busy={busy === table.id} onReply={reply} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

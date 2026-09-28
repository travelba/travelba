import { FullCreditDesk } from "@/components/admin/FullCreditDesk";
import { EXAMPLE_REFERENCE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleAgencyPage() {
  const session = readExample();
  const b = session.booking;
  const now = new Date().toISOString();
  const pending = session.fullCredits.some((row) => row.status === "demandee");
  const guest = `${session.customer.first_name} ${session.customer.last_name}`.trim();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Dossier agence</p>
          <h1 className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">{b.reference || EXAMPLE_REFERENCE}</h1>
          <p className="text-sm text-muted">
            {guest} · {b.destination}
          </p>
        </div>
        {pending ? (
          <a
            href="#full-credit"
            className="admin-tap inline-flex items-center rounded-full border border-[var(--admin-gold)] bg-[#f8f4ed] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Full credit à envoyer
          </a>
        ) : null}
      </header>
      <FullCreditDesk
        bookingId={b.id}
        reference={b.reference}
        visible={b.visible_to_client}
        status={b.status}
        clientSettles={b.client_settles_stay === true}
        pliantReady={false}
        items={session.items}
        credits={session.fullCredits}
        now={now}
        endpoint={`/api/exemple/bookings/${b.reference}/full-credit`}
      />
    </main>
  );
}

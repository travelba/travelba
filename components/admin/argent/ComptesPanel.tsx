import Link from "next/link";
import { AccountBalanceCard } from "@/components/admin/AccountBalance";
import { PliantAccountBalanceCard } from "@/components/admin/PliantCardDesk";
import { RevolutConnectButton } from "@/components/admin/RevolutConnectButton";
import { argentHref } from "@/lib/crm/argent-tabs";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";
import { loadRevolutAccountBalances, revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { loadStripeAccountBalance, stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        ok ? "bg-[var(--admin-sky)] text-[var(--admin-navy)]" : "bg-amber-50 text-amber-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--admin-navy)]" : "bg-amber-500"}`} aria-hidden />
      {children}
    </p>
  );
}

function Account({
  title,
  status,
  children,
  note,
  action,
}: {
  title: string;
  status: React.ReactNode;
  children?: React.ReactNode;
  note: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="admin-af-card space-y-3 rounded-3xl px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</h2>
        {status}
      </div>
      {children}
      <p className="text-sm text-muted">{note}</p>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </section>
  );
}

/** Comptes : soldes Revolut, Stripe et Pliant, connexion et où chaque mouvement arrive. Aucune écriture ici. */
export async function ComptesPanel() {
  const revolutOk = revolutConfigured();
  const connected = revolutOk ? await revolutConnected() : false;
  const stripeOk = stripeConfigured();
  const pliantOk = pliantConfigured();
  const [revolut, stripe, pliant] = await Promise.all([
    connected ? loadRevolutAccountBalances() : Promise.resolve(null),
    stripeOk ? loadStripeAccountBalance() : Promise.resolve(null),
    pliantOk ? loadPliantAccountBalance() : Promise.resolve(null),
  ]);
  const encaisser = argentHref("a-encaisser");
  const pointer = argentHref("a-pointer");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Account
        title="Revolut"
        status={
          !revolutOk ? (
            <Status ok={false}>Non installé</Status>
          ) : !revolutClientId() ? (
            <Status ok={false}>Client ID manquant</Status>
          ) : connected ? (
            <Status ok>Compte relié</Status>
          ) : (
            <Status ok={false}>À connecter</Status>
          )
        }
        note={
          connected ? (
            <>
              Les virements reçus arrivent toutes les 15 min dans{" "}
              <Link href={encaisser} className="font-semibold underline">
                À encaisser
              </Link>
              . Les sorties du compte se pointent sur un dossier dans{" "}
              <Link href={pointer} className="font-semibold underline">
                À pointer
              </Link>
              . Aucun crédit ne part sans le clic Créditer.
            </>
          ) : revolutOk ? (
            "Aucun virement tant que Revolut n’est pas connecté (authentification Business). Les virements reçus arriveront ensuite dans À encaisser, toutes les 15 min."
          ) : (
            "Intégration Revolut non installée côté serveur. Une fois les clés posées, connectez le compte Business ici."
          )
        }
        action={
          revolutOk && !connected ? (
            <RevolutConnectButton />
          ) : connected ? (
            <Link
              href={encaisser}
              className="admin-tap inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Voir À encaisser
            </Link>
          ) : null
        }
      >
        {revolut ? <AccountBalanceCard pockets={revolut} /> : null}
      </Account>

      <Account
        title="Stripe"
        status={
          !stripeOk ? (
            <Status ok={false}>Non installé</Status>
          ) : stripeWebhookConfigured() ? (
            <Status ok>Paiements reçus en direct</Status>
          ) : (
            <Status ok={false}>Webhook à poser</Status>
          )
        }
        note={
          stripeOk
            ? "Les paiements par carte arrivent dans À encaisser. Le disponible est en grand, le montant en attente de versement en dessous. Les cartes du client sont des références Stripe, jamais un numéro."
            : "Cartes Stripe non ouvertes. Les virements Revolut et la saisie d’un virement au grand livre suffisent."
        }
        action={
          stripeOk ? (
            <Link
              href={encaisser}
              className="admin-tap inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Voir À encaisser
            </Link>
          ) : null
        }
      >
        {stripe ? <AccountBalanceCard pockets={stripe} /> : null}
      </Account>

      <Account
        title="Pliant"
        status={pliantOk ? <Status ok>Compte relié</Status> : <Status ok={false}>Non installé</Status>}
        note={
          pliantOk ? (
            <>
              Les cartes fournisseur se créent depuis le dossier (onglet Argent). Chaque dépense se pointe sur une étape d’un dossier dans{" "}
              <Link href={argentHref("a-pointer", { vue: "pliant" })} className="font-semibold underline">
                Toutes les dépenses Pliant
              </Link>
              . Pliant ne débite jamais le client.
            </>
          ) : (
            "Intégration Pliant non installée côté serveur."
          )
        }
        action={
          pliantOk ? (
            <Link
              href={argentHref("a-pointer", { vue: "pliant" })}
              className="admin-tap inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Voir les dépenses
            </Link>
          ) : null
        }
      >
        {pliantOk ? <PliantAccountBalanceCard account={pliant} /> : null}
      </Account>
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";
import {
  roleActionLabel,
  staffRoleLabel,
  type Colleague,
  type StaffRole,
} from "@/lib/crm/staff-team";

const fieldClass = "admin-af-input w-full text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

export function TeamDesk({
  colleagues,
  currentId,
}: {
  colleagues: Colleague[];
  currentId: string;
}) {
  const router = useRouter();
  const adminCount = useMemo(
    () => colleagues.filter((row) => row.role === "admin").length,
    [colleagues]
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("agent");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setCopied(false);
    setLink(null);
    try {
      const res = await fetch("/api/admin/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Ajout impossible. Réessayez.");
        return;
      }
      setFullName("");
      setEmail("");
      setRole("agent");
      setLink(typeof json.link === "string" ? json.link : null);
      setNotice(
        json.delivered
          ? "Accès préparé. L’e-mail est parti, et le lien reste valable 30 jours."
          : "Accès préparé. L’e-mail n’est pas parti : copiez le lien. Il reste valable 30 jours."
      );
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={onSubmit} className="admin-af-card grid gap-4 rounded-2xl p-5 lg:grid-cols-4">
        <p className="font-display text-lg font-bold text-[var(--admin-navy)] lg:col-span-4">
          Nouveau collègue
        </p>
        <label className={labelClass}>
          Nom
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            autoComplete="off"
            disabled={saving}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          E-mail
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="off"
            disabled={saving}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Rôle
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
            disabled={saving}
            className={fieldClass}
          >
            <option value="agent">Agent</option>
            <option value="admin">Administrateur</option>
            <option value="partner">Partenaire MyLER</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="admin-af-btn w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </div>
        <p className="text-sm text-muted lg:col-span-4">
          L’agent ouvre l’espace agence. L’administrateur fait de même, et gère les collègues. Partenaire MyLER
          n’ouvre que Little Emperors : la clé de test, Actualiser, les routes v2. Pas le reste de l’agence.
        </p>
        <div className="lg:col-span-4">
          <BusyBar active={saving} label="Ajout du collègue…" />
        </div>
        {error ? <p className="text-sm text-[var(--admin-red)] lg:col-span-4">{error}</p> : null}
        {notice ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[rgba(197,168,128,0.15)] px-4 py-3 text-sm text-[var(--admin-navy)] lg:col-span-4 sm:flex-row sm:items-center sm:justify-between">
            <p>{notice}</p>
            {link ? (
              <button
                type="button"
                onClick={() => void copyLink()}
                className="shrink-0 rounded-full border border-[var(--admin-navy)] px-4 py-2 text-sm font-semibold"
              >
                {copied ? "Lien copié" : "Copier le lien"}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="admin-af-card overflow-hidden rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">
            {colleagues.length} collègue{colleagues.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            Un administrateur ne se retire pas. Limitez d’abord son rôle à agent — l’agence garde
            toujours un administrateur.
          </p>
        </div>
        <ul className="lg:hidden">
          {colleagues.map((member) => (
            <ColleagueRow
              key={`card-${member.id}-${member.role}`}
              layout="card"
              member={member}
              current={member.id === currentId}
              adminCount={adminCount}
            />
          ))}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Collègue</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Rôle</th>
                <th className="px-5 py-3 text-right">
                  <span className="sr-only">Retrait</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {colleagues.map((member) => (
                <ColleagueRow
                  key={`${member.id}-${member.role}`}
                  layout="row"
                  member={member}
                  current={member.id === currentId}
                  adminCount={adminCount}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ColleagueRow({
  layout,
  member,
  current,
  adminCount,
}: {
  layout: "card" | "row";
  member: Colleague;
  current: boolean;
  adminCount: number;
}) {
  const router = useRouter();
  const [role, setRole] = useState<StaffRole>(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = roleActionLabel(member.role, role);
  const lastAdmin = member.role === "admin" && adminCount <= 1;
  const canRemove = member.role !== "admin" && !current;

  async function saveRole() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/equipe/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Changement impossible.");
        setRole(member.role);
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
      setRole(member.role);
    } finally {
      setBusy(false);
    }
  }

  /** Confirmé dans la ligne : renvoie l’erreur pour l’afficher sous le bouton. */
  async function remove() {
    const result = await adminAction(`/api/admin/equipe/${member.id}`, { method: "DELETE" });
    if (!result.ok) return result.error || "Retrait impossible.";
    router.refresh();
    return undefined;
  }

  const roleId = `role-${layout}-${member.id}`;
  const identity = (
    <>
      <p className="font-semibold text-[var(--admin-navy)]">{member.fullName}</p>
      <p className="mt-1 text-xs text-muted">
        {staffRoleLabel(member.role)}
        {current ? " · Vous" : ""}
      </p>
    </>
  );
  const roleControl = (
    <div className="flex flex-col items-start gap-2">
      <label className="sr-only" htmlFor={roleId}>
        Rôle de {member.fullName}
      </label>
      <select
        id={roleId}
        value={role}
        disabled={busy}
        onChange={(event) => {
          setRole(event.target.value as StaffRole);
          setError(null);
        }}
        className="admin-af-input w-full text-sm lg:w-auto"
        title={lastAdmin ? "L’agence garde au moins un administrateur." : undefined}
      >
        <option value="agent" disabled={lastAdmin}>
          Agent
        </option>
        <option value="partner" disabled={lastAdmin}>
          Partenaire MyLER
        </option>
        <option value="admin">Administrateur</option>
      </select>
      {action ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveRole()}
          className="rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-gold)] disabled:opacity-60"
        >
          {busy ? "Enregistrement…" : action}
        </button>
      ) : null}
      <BusyBar active={busy} label="Enregistrement…" />
    </div>
  );
  const removal = (
    <>
      {canRemove ? (
        <ConfirmAction
          size="sm"
          tone="danger"
          label="Retirer"
          confirmLabel="Retirer l’accès"
          busyLabel="Retrait…"
          ariaLabel={`Retirer ${member.fullName}`}
          question={`Retirer ${member.fullName} coupe l’accès à l’espace agence. Les dossiers restent.`}
          align={layout === "card" ? "start" : "end"}
          disabled={busy}
          wrapperClassName="mt-2"
          onConfirm={remove}
        />
      ) : (
        <p className="text-xs text-muted">{member.role === "admin" ? "Non retiré" : "Votre accès"}</p>
      )}
      {error ? <p className="mt-2 text-xs text-[var(--admin-red)]">{error}</p> : null}
    </>
  );

  if (layout === "card") {
    return (
      <li className="space-y-3 border-t border-[var(--border)] px-5 py-4 text-sm">
        <div>{identity}</div>
        <p className="break-all text-muted">{member.email || "Adresse indisponible"}</p>
        {roleControl}
        {removal}
      </li>
    );
  }

  return (
    <tr className="border-t border-[var(--border)] align-top">
      <td className="px-5 py-4">{identity}</td>
      <td className="px-5 py-4 text-muted">{member.email || "Adresse indisponible"}</td>
      <td className="px-5 py-4">{roleControl}</td>
      <td className="px-5 py-4 text-right">{removal}</td>
    </tr>
  );
}

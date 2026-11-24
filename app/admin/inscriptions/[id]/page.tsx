import Link from "next/link";
import { notFound } from "next/navigation";
import { SignupReview } from "@/components/admin/SignupReview";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { roleAllows } from "@/lib/crm/agency-access";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { requireStaffPage } from "@/lib/crm/auth";
import { readSignupAdmin } from "@/lib/crm/signup-run";

export const metadata = { title: "Demande d’inscription" };

export default async function InscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaffPage();
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(staff.role, "review_signups", matrix)) {
    return <PageTitle title="Inscriptions" subtitle="Réservé aux administrateurs." />;
  }
  const { id } = await params;
  let detail: Awaited<ReturnType<typeof readSignupAdmin>>;
  try {
    detail = await readSignupAdmin(id);
  } catch {
    notFound();
  }
  if (!detail.ready) {
    return <PageTitle title="Inscriptions" subtitle="La migration n’est pas encore appliquée." />;
  }
  const row = detail.request;
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Clients</PageEyebrow>
        <PageTitle
          title={`${row.first_name} ${row.last_name}`}
          subtitle={row.status.replaceAll("_", " ")}
          actions={
            <Link href="/admin/inscriptions" className="text-sm font-semibold underline">
              Retour à la file
            </Link>
          }
        />
      </div>
      <dl className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">E-mail</dt>
          <dd className="font-semibold">{row.email}</dd>
        </div>
        <div>
          <dt className="text-muted">Téléphone</dt>
          <dd className="font-semibold">{row.phone}</dd>
        </div>
        <div>
          <dt className="text-muted">Naissance</dt>
          <dd>{row.birth_date}</dd>
        </div>
        <div>
          <dt className="text-muted">Connu par</dt>
          <dd>{row.heard_about}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Préférences</dt>
          <dd>{row.travel_preferences || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Parrain</dt>
          <dd>
            {detail.referrer
              ? `${detail.referrer.first_name} ${detail.referrer.last_name} · ${detail.referrer.code}`
              : row.referral_raw
                ? `Code non reconnu : ${row.referral_raw}`
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">E-mail confirmé</dt>
          <dd>{row.email_verified_at ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-muted">Téléphone confirmé</dt>
          <dd>{row.phone_verified_at ? "Oui" : "Non"}</dd>
        </div>
      </dl>
      <SignupReview id={row.id} status={row.status} matches={detail.matches} invited={row.invited_by_staff} />
    </div>
  );
}

import { phoneSearchDigits } from "./admin-list";
import { stayHeadline } from "./carnet";
import { formatDateFr, formatMoney } from "./money";
import { staffStayLabel } from "./staff-stay";

/** Ce que la liste des dossiers peut retrouver : le texte affiché, le client, le montant. */
export function bookingListSearchText(input: {
  reference: string;
  title?: string | null;
  destination?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  archived_at?: string | null;
  visible_to_client?: boolean | null;
  currency?: string | null;
  customer?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  places?: string[] | null;
  routes?: string[] | null;
  amount?: number | null;
}) {
  const places = input.places || [];
  const routes = input.routes || [];
  const phone = phoneHints(input.phone);
  const amount =
    input.amount == null || !Number.isFinite(input.amount)
      ? ""
      : `${input.amount} ${formatMoney(input.amount, input.currency || "EUR")}`;
  return [
    input.reference,
    input.title,
    input.destination,
    stayHeadline(input.title, input.destination, routes.length ? routes : places),
    input.customer,
    input.company,
    input.email,
    phone,
    staffStayLabel(input),
    input.start_date ? formatDateFr(input.start_date) : "",
    input.end_date ? formatDateFr(input.end_date) : "",
    amount,
    ...places,
    ...routes,
  ]
    .filter(Boolean)
    .join(" ");
}

/** « 06 12 » et « +33 6 » retrouvent le même numéro. */
function phoneHints(phone: string | null | undefined) {
  const raw = (phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const national = phoneSearchDigits(raw);
  return [raw, digits, national, national ? `0${national}` : ""].filter(Boolean).join(" ");
}

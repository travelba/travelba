import { NotFoundPanel } from "@/components/crm/ErrorPanel";

export default function AccountNotFound() {
  return <NotFoundPanel homeHref="/mon-compte/reservations" homeLabel="Mes réservations" />;
}

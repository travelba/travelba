import { NotFoundPanel } from "@/components/crm/ErrorPanel";

/* Hors scope .admin-af (site public sombre) : le panneau lit les variables marine / champagne,
   donc on lui donne le fond clair du CRM pour que le titre et le bouton restent visibles. */
export default function NotFound() {
  return (
    <div className="admin-af account-app min-h-screen">
      <NotFoundPanel homeHref="/" homeLabel="Retour à l’accueil" />
    </div>
  );
}

import { NotFoundPanel } from "@/components/crm/ErrorPanel";

export default function AccountNotFound() {
  return <NotFoundPanel homeHref="/mon-compte" homeLabel="Retour à mon espace" />;
}

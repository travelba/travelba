import { notFound } from "next/navigation";

/** Une URL inconnue sous /admin reste dans la coquille agence. */
export default function AdminUnknownPage() {
  notFound();
}

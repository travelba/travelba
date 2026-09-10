import { redirectExpense } from "@/lib/agency/short-links";

type Params = { params: Promise<{ code: string }> };

/** Lien court WhatsApp → suivi dépenses (`/devis/…`). */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  return redirectExpense(code);
}

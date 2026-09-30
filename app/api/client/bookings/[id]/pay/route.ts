import { jsonError } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Le règlement se fait dans Transactions, sur l’encours. */
export async function POST(_request: Request, _ctx: Ctx) {
  return jsonError("Le règlement se fait dans Transactions.", 410);
}

import { cookies } from "next/headers";
import { requireCustomer } from "@/lib/crm/auth";
import { handleClientAccountDeletion, sendDeletionMail } from "@/lib/crm/account-deletion";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { listCrmFiles, removeCrmFiles } from "@/lib/crm/files";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function forgetStripeCustomer(stripeCustomerId: string) {
  const { getStripe } = await import("@/lib/crm/stripe");
  const stripe = getStripe();
  if (!stripe) return;
  await stripe.customers.del(stripeCustomerId);
}

/** Efface le compte du titulaire. Un compte d’agence est refusé. Les dossiers et les factures restent. */
export async function POST() {
  const admin = createServiceClient();
  const jar = await cookies();
  return handleClientAccountDeletion({
    requireCustomer,
    isDesk: (userId) => deskBypass(jar.get(DESK_COOKIE)?.value, userId),
    admin,
    deleteAuthUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) return { error: null };
      const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
      return { error: { message: error.message, status, code: error.code } };
    },
    listFiles: listCrmFiles,
    removeFiles: removeCrmFiles,
    notifyAgency: sendDeletionMail,
    forgetStripeCustomer,
  });
}

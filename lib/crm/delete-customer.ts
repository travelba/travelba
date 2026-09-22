import { createServiceClient } from "@/lib/supabase/admin";
import { listCrmFiles, removeCrmFiles } from "@/lib/crm/files";
import { customerFilePrefixes, isUuid } from "@/lib/crm/ids";
import { customerFullName } from "@/lib/crm/types";

export class CustomerDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function deleteCustomerById(customerId: string) {
  if (!isUuid(customerId)) throw new CustomerDeleteError("Identifiant invalide");
  const admin = createServiceClient();

  const { data: customer, error: loadError } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name, email, auth_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (loadError) throw new CustomerDeleteError(loadError.message, 500);
  if (!customer) throw new CustomerDeleteError("Client introuvable", 404);

  const { data: bookings, error: bookingsError } = await admin
    .from("crm_bookings")
    .select("id, cover_image_path")
    .eq("customer_id", customerId);
  if (bookingsError) throw new CustomerDeleteError(bookingsError.message, 500);
  const bookingRows = bookings || [];
  const bookingIds = bookingRows.map((row) => row.id as string);

  const paths: string[] = [];
  const { data: travelDocs } = await admin
    .from("crm_travel_documents")
    .select("storage_path")
    .eq("customer_id", customerId);
  for (const row of travelDocs || []) {
    if (row.storage_path) paths.push(row.storage_path);
  }

  if (bookingIds.length) {
    const { data: bookingDocs } = await admin
      .from("crm_booking_documents")
      .select("storage_path")
      .in("booking_id", bookingIds);
    for (const row of bookingDocs || []) {
      if (row.storage_path) paths.push(row.storage_path);
    }
  }
  for (const booking of bookingRows) {
    if (booking.cover_image_path) paths.push(booking.cover_image_path);
  }
  for (const prefix of customerFilePrefixes(customerId, bookingIds)) {
    paths.push(...(await listCrmFiles(prefix)));
  }

  if (bookingIds.length) {
    const { error } = await admin.from("crm_bookings").delete().in("id", bookingIds);
    if (error) throw new CustomerDeleteError(error.message);
  }

  const { error: txError } = await admin
    .from("crm_transactions")
    .delete()
    .eq("customer_id", customerId);
  if (txError) throw new CustomerDeleteError(txError.message);

  const { error: delError } = await admin.from("crm_customers").delete().eq("id", customerId);
  if (delError) throw new CustomerDeleteError(delError.message);

  await removeCrmFiles(paths);

  if (customer.auth_user_id) {
    const { data: staff } = await admin
      .from("crm_staff")
      .select("id")
      .eq("auth_user_id", customer.auth_user_id)
      .maybeSingle();
    if (!staff) {
      const { error: authError } = await admin.auth.admin.deleteUser(customer.auth_user_id);
      if (authError) console.error("[delete-customer] auth", authError.message);
    }
  }

  return { ok: true as const, name: customerFullName(customer) };
}

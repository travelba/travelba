-- B-15 : un client connecté (rôle authenticated, policy self_update) ne modifie
-- que les colonnes de sa fiche qu’il peut éditer lui-même. Jamais email,
-- auth_user_id, stripe_customer_id, company_role, billing_parent_id, iban,
-- on_hold, is_vip, whatsapp_opt_in_at, whatsapp_opt_out_at : ces colonnes ne
-- s’écrivent qu’avec le service role (routes admin après requireStaff,
-- /api/client/profile pour l’IBAN après requireCustomer).
-- Le staff passe aussi par le rôle authenticated : ses écritures sur ces
-- colonnes ont été basculées sur createServiceClient().

revoke update on public.crm_customers from authenticated;

grant update (
  first_name,
  last_name,
  usage_name,
  phone,
  phone_secondary,
  birth_date,
  sex,
  nationality,
  address_line,
  postal_code,
  city,
  country,
  language,
  flying_blue,
  loyalty,
  company_name,
  siret,
  vat_number,
  billing_email,
  billing_address_line,
  billing_postal_code,
  billing_city,
  billing_country
) on public.crm_customers to authenticated;

-- B-14 : la référence de dossier ne se tire plus depuis le navigateur.
-- Les routes staff appellent la RPC avec le service role.
revoke execute on function public.crm_next_booking_reference() from anon, authenticated;
grant execute on function public.crm_next_booking_reference() to service_role;

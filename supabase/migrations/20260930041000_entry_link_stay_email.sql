-- Lien de séjour sans e-mail : le dossier n’a qu’un titulaire.

update public.crm_entry_links as link
set email = lower(customer.email)
from public.crm_bookings as booking
join public.crm_customers as customer on customer.id = booking.customer_id
where link.next_path = '/mon-compte/reservations/' || booking.reference
  and coalesce(btrim(link.email), '') = ''
  and coalesce(btrim(customer.email), '') <> ''
  and (
    select count(distinct other.customer_id)
    from public.crm_bookings as other
    where other.reference = booking.reference
  ) = 1;

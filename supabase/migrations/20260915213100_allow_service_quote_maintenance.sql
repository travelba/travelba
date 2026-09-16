-- Keep signed client decisions exclusive while allowing service-role maintenance.

create or replace function crm_private.enforce_quote_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('accepted', 'declined')
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Un devis accepté ou refusé est immuable'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.booking_id is not null and not exists (
    select 1 from public.crm_bookings booking
    where booking.id = new.booking_id
      and booking.customer_id = new.customer_id
  ) then
    raise exception 'Le dossier et le devis appartiennent à des clients différents'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('accepted', 'declined')
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Un devis accepté ou refusé est immuable'
        using errcode = '42501';
    end if;
    if old.status = 'sent' and new.status = 'sent' and (
      new.title is distinct from old.title
      or new.currency is distinct from old.currency
      or new.valid_until is distinct from old.valid_until
      or new.terms is distinct from old.terms
      or new.client_note is distinct from old.client_note
      or new.booking_id is distinct from old.booking_id
    ) then
      raise exception 'Repassez le devis en brouillon avant de le modifier'
        using errcode = '42501';
    end if;
    if old.status is distinct from new.status
       and new.status in ('accepted', 'declined')
       and coalesce(auth.role(), '') <> 'service_role'
       and crm_private.is_staff() then
      raise exception 'La décision signée est réservée au client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

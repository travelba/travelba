-- Sortie Revolut rattachée à un dossier. Le montant ne devient pas une ligne du grand livre.
alter table public.crm_revolut_transactions
  add column if not exists matched_booking_id uuid references public.crm_bookings (id) on delete set null;

alter table public.crm_revolut_transactions
  add column if not exists settled_at timestamptz;

comment on column public.crm_revolut_transactions.matched_booking_id is
  'Dossier choisi par l’agence pour une sortie. Pas de crédit, pas de débit client.';

comment on column public.crm_revolut_transactions.settled_at is
  'Clic Valider ou Refuser. Null : la sortie n’a pas encore été traitée.';

create index if not exists crm_revolut_transactions_matched_booking_idx
  on public.crm_revolut_transactions (matched_booking_id)
  where matched_booking_id is not null;

-- L’import historique posait ignored sans clic. Ces lignes reviennent dans la file.
update public.crm_revolut_transactions
set status = 'unmatched'
where direction = 'debit'
  and status = 'ignored'
  and settled_at is null
  and matched_customer_id is null
  and matched_booking_id is null
  and matched_transaction_id is null;

-- Si le dossier disparaît, la sortie revient à rapprocher.
create or replace function public.crm_revolut_reopen_cleared_booking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.direction = 'debit'
     and old.matched_booking_id is not null
     and new.matched_booking_id is null then
    new.status := 'unmatched';
    new.settled_at := null;
    new.matched_customer_id := null;
    new.matched_transaction_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_revolut_reopen_cleared_booking on public.crm_revolut_transactions;
create trigger crm_revolut_reopen_cleared_booking
  before update of matched_booking_id on public.crm_revolut_transactions
  for each row
  execute function public.crm_revolut_reopen_cleared_booking();

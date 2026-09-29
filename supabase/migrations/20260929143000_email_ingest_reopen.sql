-- Si le dossier lié à un mail est supprimé, la pièce revient dans la file
-- (parsed / matched). Elle ne reste pas « attached » sans réservation.

create or replace function public.crm_email_ingest_reopen_when_unlinked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'attached'
     and old.created_booking_id is not null
     and new.created_booking_id is null
     and new.status = 'attached' then
    new.status := case
      when new.suggested_customer_id is not null then 'matched'
      else 'parsed'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_email_ingest_reopen on public.crm_email_ingest;
create trigger trg_crm_email_ingest_reopen
  before update on public.crm_email_ingest
  for each row
  execute function public.crm_email_ingest_reopen_when_unlinked();

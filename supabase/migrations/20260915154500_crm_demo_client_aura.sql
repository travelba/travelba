-- Client exemple Aura (Marie Dupont) — idempotent
insert into public.crm_customers (email, first_name, last_name, phone, language, city, country)
values ('client.demo@travelba.fr', 'Marie', 'Dupont', '+33612345678', 'fr', 'Paris', 'France')
on conflict (email) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone = excluded.phone;

insert into public.crm_travel_companions (
  customer_id, first_name, last_name, nationality, relationship
)
select c.id, 'Thomas', 'Dupont', 'FR', 'Conjoint'
from public.crm_customers c
where c.email = 'client.demo@travelba.fr'
  and not exists (
    select 1
    from public.crm_travel_companions x
    where x.customer_id = c.id
      and x.first_name = 'Thomas'
      and x.last_name = 'Dupont'
  );

insert into public.crm_travel_documents (
  customer_id, doc_type, number, issuing_country, expires_on
)
select c.id, 'passport', 'DEMO-12AB34567', 'FR', '2030-06-15'
from public.crm_customers c
where c.email = 'client.demo@travelba.fr'
  and not exists (
    select 1
    from public.crm_travel_documents d
    where d.customer_id = c.id and d.number = 'DEMO-12AB34567'
  );

insert into public.crm_bookings (
  customer_id, reference, title, destination, status,
  start_date, end_date, currency, total_amount, notes_client
)
select
  c.id, 'TBA-DEMO-0001', 'Escapade automnale Kyoto', 'Kyoto, Japon',
  'confirmed', '2026-10-14', '2026-10-24', 'EUR', 5800,
  'Dossier exemple Aura — conciergerie TBA.'
from public.crm_customers c
where c.email = 'client.demo@travelba.fr'
on conflict (reference) do update set
  title = excluded.title,
  destination = excluded.destination,
  status = excluded.status,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  total_amount = excluded.total_amount,
  notes_client = excluded.notes_client;

insert into public.crm_booking_items (
  booking_id, kind, title, supplier, confirmation_ref, amount, sort_order
)
select b.id, v.kind, v.title, v.supplier, v.confirmation_ref, v.amount, v.sort_order
from public.crm_bookings b
cross join (
  values
    ('flight', 'Vol AF 292 CDG → KIX', 'Air France', 'AF292-DEMO', 1850::numeric, 1),
    ('hotel', 'Hoshinoya Kyoto — Suite rivière', 'Hoshinoya', 'HK-88421', 3200::numeric, 2),
    ('transfer', 'Transfert privé KIX → Kyoto', 'TBA Cars', 'TR-110', 180::numeric, 3)
) as v(kind, title, supplier, confirmation_ref, amount, sort_order)
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1
    from public.crm_booking_items i
    where i.booking_id = b.id and i.sort_order = v.sort_order
  );

insert into public.crm_booking_travelers (
  booking_id, is_account_holder, first_name, last_name
)
select b.id, v.is_account_holder, v.first_name, v.last_name
from public.crm_bookings b
cross join (
  values
    (true, 'Marie', 'Dupont'),
    (false, 'Thomas', 'Dupont')
) as v(is_account_holder, first_name, last_name)
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1
    from public.crm_booking_travelers t
    where t.booking_id = b.id
      and t.first_name = v.first_name
      and t.last_name = v.last_name
  );

insert into public.crm_transactions (
  customer_id, booking_id, direction, kind, amount, currency,
  occurred_on, label, source, status
)
select b.customer_id, b.id, v.direction, v.kind, v.amount, 'EUR',
  v.occurred_on, v.label, 'manual', 'posted'
from public.crm_bookings b
cross join (
  values
    ('debit', 'booking', 5800::numeric, '2026-06-01'::date, 'Réservation TBA-DEMO-0001 — Kyoto'),
    ('credit', 'transfer', 8170::numeric, '2026-08-10'::date, 'Apport Revolut Pay — Compte principal'),
    ('debit', 'adjustment', 420::numeric, '2026-09-01'::date, 'Kitcho Arashiyama — Omakase VIP'),
    ('credit', 'transfer', 1500::numeric, '2026-09-02'::date, 'Apport Revolut Pay')
) as v(direction, kind, amount, occurred_on, label)
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1
    from public.crm_transactions t
    where t.customer_id = b.customer_id and t.label = v.label
  );

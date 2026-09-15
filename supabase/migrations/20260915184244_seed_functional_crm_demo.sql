-- Extend the existing Marie/Kyoto sample with every functional CRM module.
insert into public.crm_quotes (
  customer_id, booking_id, reference, title, status, currency, valid_until,
  terms, client_note, version, sent_at
)
select
  b.customer_id, b.id, 'DEV-DEMO-KYOTO', 'Escapade automnale Kyoto',
  'sent', 'EUR', current_date + 30,
  'Le devis devient ferme après acceptation explicite. Les conditions fournisseurs restent applicables.',
  'Merci de vérifier les noms tels qu’ils figurent sur les passeports.',
  1, now()
from public.crm_bookings b
where b.reference = 'TBA-DEMO-0001'
on conflict (reference) do update set
  booking_id = excluded.booking_id,
  title = excluded.title,
  valid_until = excluded.valid_until,
  terms = excluded.terms,
  client_note = excluded.client_note;

insert into public.crm_quote_lines (
  quote_id, kind, title, description, quantity, unit_price,
  supplier_cost, tax_rate, optional, selected, sort_order
)
select q.id, line.kind, line.title, line.description, line.quantity,
  line.unit_price, line.supplier_cost, line.tax_rate, line.optional,
  line.selected, line.sort_order
from public.crm_quotes q
cross join (
  values
    ('flight', 'Vol Air France CDG – KIX', 'Classe Premium Economy, bagage inclus', 2::numeric, 925::numeric, 760::numeric, 0::numeric, false, true, 1),
    ('hotel', 'Hoshinoya Kyoto', 'Suite rivière, petit-déjeuner et transfert bateau', 1::numeric, 3200::numeric, 2550::numeric, 0::numeric, false, true, 2),
    ('transfer', 'Transfert privé KIX – Kyoto', 'Accueil nominatif à l’arrivée', 1::numeric, 180::numeric, 120::numeric, 0::numeric, false, true, 3),
    ('activity', 'Cérémonie du thé privée', 'Option avec guide francophone', 2::numeric, 285::numeric, 390::numeric, 0::numeric, true, true, 4)
) as line(kind,title,description,quantity,unit_price,supplier_cost,tax_rate,optional,selected,sort_order)
where q.reference = 'DEV-DEMO-KYOTO'
  and not exists (
    select 1 from public.crm_quote_lines existing
    where existing.quote_id = q.id and existing.sort_order = line.sort_order
  );

insert into public.crm_quote_versions (quote_id, version, snapshot)
select q.id, 1, jsonb_build_object(
  'reference', q.reference,
  'title', q.title,
  'status', q.status,
  'captured_at', now()
)
from public.crm_quotes q
where q.reference = 'DEV-DEMO-KYOTO'
on conflict (quote_id, version) do nothing;

insert into public.crm_payment_schedules (
  customer_id, booking_id, quote_id, label, amount, currency,
  due_on, status, paid_amount
)
select b.customer_id, b.id, q.id, 'Solde voyage Kyoto', 2900, 'EUR',
  current_date + 14, 'pending', 1500
from public.crm_bookings b
join public.crm_quotes q on q.reference = 'DEV-DEMO-KYOTO'
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1 from public.crm_payment_schedules s
    where s.booking_id = b.id and s.label = 'Solde voyage Kyoto'
  );

insert into public.crm_invoices (
  customer_id, booking_id, quote_id, number, kind, status,
  amount, currency, issued_on, due_on
)
select b.customer_id, b.id, q.id, 'FAC-DEMO-2026-001', 'invoice',
  'issued', 5800, 'EUR', current_date, current_date + 14
from public.crm_bookings b
join public.crm_quotes q on q.reference = 'DEV-DEMO-KYOTO'
where b.reference = 'TBA-DEMO-0001'
on conflict (number) do nothing;

insert into public.crm_service_requests (
  customer_id, booking_id, category, subject, message,
  priority, status, staff_response, responded_at
)
select b.customer_id, b.id, 'document', 'Vouchers hôtel',
  'Quand recevrai-je les vouchers définitifs ?', 'normal', 'resolved',
  'Ils seront publiés dans votre coffre documentaire dix jours avant le départ.',
  now()
from public.crm_bookings b
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1 from public.crm_service_requests r
    where r.booking_id = b.id and r.subject = 'Vouchers hôtel'
  );

insert into public.crm_notifications (
  customer_id, booking_id, kind, title, message, action_url
)
select b.customer_id, b.id, 'travel', 'Votre voyage à Kyoto se prépare',
  'Votre itinéraire est disponible. Les liens mTrip seront activés uniquement après le dernier contrôle agence.',
  '/mon-compte/reservations/TBA-DEMO-0001/itineraire'
from public.crm_bookings b
where b.reference = 'TBA-DEMO-0001'
  and not exists (
    select 1 from public.crm_notifications n
    where n.booking_id = b.id and n.title = 'Votre voyage à Kyoto se prépare'
  );

insert into public.crm_tasks (
  customer_id, booking_id, title, description, category,
  priority, status, due_at, source_key
)
select b.customer_id, b.id, 'Contrôler les vouchers Kyoto',
  'Vérifier les noms voyageurs, dates, confirmations et visibilité client.',
  'document', 'high', 'todo', now() + interval '2 days',
  'demo:kyoto:vouchers'
from public.crm_bookings b
where b.reference = 'TBA-DEMO-0001'
on conflict (source_key) do nothing;

insert into public.crm_suppliers (
  kind, name, contact_name, email, phone, account_reference, notes
)
select 'hotel', 'Hoshinoya Kyoto', 'Réservations', 'reservations@example.invalid',
  '+81 00 0000 0000', 'TBA-DEMO', 'Fournisseur de démonstration — ne pas contacter.'
where not exists (
  select 1 from public.crm_suppliers s
  where s.name = 'Hoshinoya Kyoto' and s.account_reference = 'TBA-DEMO'
);

insert into public.crm_mtrip_publications (
  booking_id, state, validation_errors
)
select b.id, 'draft', '["Contrôle géographique et publication mTrip requis"]'::jsonb
from public.crm_bookings b
where b.reference = 'TBA-DEMO-0001'
on conflict (booking_id) do nothing;

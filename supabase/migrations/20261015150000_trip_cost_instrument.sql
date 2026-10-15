-- Mode de règlement de chaque coût, déduit de sa source au rattachement :
-- carte Pliant (4 derniers chiffres), virement Revolut, carte bancaire Revolut, autre sortie Revolut.
-- Sert à la trace « Réglé par … » sur la ligne de facture MB3M et à l’affichage CRM.

alter table public.crm_trip_costs
  add column if not exists instrument text,
  add column if not exists instrument_detail text;

alter table public.crm_trip_costs
  drop constraint if exists crm_trip_costs_instrument_check;

alter table public.crm_trip_costs
  add constraint crm_trip_costs_instrument_check
  check (instrument is null or instrument in ('pliant_card', 'revolut_transfer', 'revolut_card', 'revolut_other'));

update public.crm_trip_costs c
set instrument = 'pliant_card',
    instrument_detail = nullif(trim(p.card_last4), '')
from public.crm_pliant_transactions p
where c.source = 'pliant'
  and c.source_id = p.id::text
  and c.instrument is null;

update public.crm_trip_costs c
set instrument = case lower(coalesce(r.raw->>'type', ''))
      when 'transfer' then 'revolut_transfer'
      when 'card_payment' then 'revolut_card'
      else 'revolut_other'
    end
from public.crm_revolut_transactions r
where c.source = 'revolut'
  and c.source_id = r.id::text
  and c.instrument is null;

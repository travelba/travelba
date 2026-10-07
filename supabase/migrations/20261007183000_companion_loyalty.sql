-- Numéros de fidélité des accompagnateurs, même carte que crm_customers.loyalty.
alter table public.crm_travel_companions
  add column if not exists loyalty jsonb;

comment on column public.crm_travel_companions.loyalty is
  'Numéros de programmes (flying_blue, grand_voyageur, great_members, …).';

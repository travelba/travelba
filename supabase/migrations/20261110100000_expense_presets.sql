-- Raccourcis du bloc Dépenses (libellé + montant). Additive.
-- N’écrit aucune carte, aucun débit, aucune facture déjà en place.
-- Une table vide au premier passage reçoit les trois raccourcis par défaut.
-- Un second passage, ou une liste déjà modifiée, ne les réécrit pas.

create table if not exists public.crm_expense_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(12, 2) not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  guard text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint crm_expense_presets_label_len check (char_length(btrim(label)) between 1 and 80),
  constraint crm_expense_presets_amount check (amount > 0 and amount <= 100000),
  constraint crm_expense_presets_guard check (guard is null or guard = 'ticketing')
);

create unique index if not exists crm_expense_presets_active_label_idx
  on public.crm_expense_presets (lower(btrim(label)))
  where active;

comment on table public.crm_expense_presets is
  'Raccourcis du bloc Dépenses. Ajouter un raccourci crée une dépense libre du dossier, sans marqueur de billeterie automatique.';
comment on column public.crm_expense_presets.guard is
  'ticketing : le raccourci ne s’ajoute pas tant qu’une ligne automatique de frais de billeterie est active.';

insert into public.crm_expense_presets (id, label, amount, sort_order, guard)
select seed.id, seed.label, seed.amount, seed.sort_order, seed.guard
from (
  values
    ('a1111111-1111-4111-8111-111111111101'::uuid, 'Frais billetterie', 25.00::numeric, 0, 'ticketing'),
    ('a1111111-1111-4111-8111-111111111102'::uuid, 'Frais billetterie train', 10.00::numeric, 1, null::text),
    ('a1111111-1111-4111-8111-111111111103'::uuid, 'Frais transfert', 10.00::numeric, 2, null::text)
) as seed(id, label, amount, sort_order, guard)
where not exists (select 1 from public.crm_expense_presets);

alter table public.crm_expense_presets enable row level security;

drop policy if exists crm_expense_presets_staff_read on public.crm_expense_presets;
create policy crm_expense_presets_staff_read
  on public.crm_expense_presets
  for select
  to authenticated
  using (crm_private.is_staff());

revoke all on public.crm_expense_presets from anon, authenticated;
grant select on public.crm_expense_presets to authenticated;
grant all on public.crm_expense_presets to service_role;

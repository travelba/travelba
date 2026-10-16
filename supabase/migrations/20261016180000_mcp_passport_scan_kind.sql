-- Distingue une lecture APIS d’une remise du fichier.
-- Additive : les lignes déjà là restent des lectures. Pas de chemin, pas de numéro.

alter table public.crm_mcp_passport_reads
  add column if not exists kind text not null default 'lecture';

alter table public.crm_mcp_passport_reads
  drop constraint if exists crm_mcp_passport_reads_kind_check;

alter table public.crm_mcp_passport_reads
  add constraint crm_mcp_passport_reads_kind_check
  check (kind in ('lecture', 'scan'));

comment on table public.crm_mcp_passport_reads is
  'Consultations de passeport. Acteur, client, dossier. Sans numéro, sans chemin, sans URL.';

comment on column public.crm_mcp_passport_reads.kind is
  'lecture : données APIS. scan : URL du fichier, dix minutes.';

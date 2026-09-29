-- Le staff a déjà une policy FOR ALL, mais authenticated n'avait que SELECT.
-- Confirmer une formalité efface le refus : DELETE renvoyait 42501.

grant insert, update, delete on public.crm_declined_services to authenticated;

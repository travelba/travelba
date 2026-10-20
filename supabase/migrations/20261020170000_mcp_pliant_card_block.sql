-- Gel et dégel d'une carte Pliant via le MCP.
-- Même journal que la création et la lecture : sans PAN, sans CVV, sans expiration.

alter table public.crm_mcp_card_events
  drop constraint if exists crm_mcp_card_events_kind_check;

alter table public.crm_mcp_card_events
  add constraint crm_mcp_card_events_kind_check
  check (kind in ('creation', 'reveal', 'blocage', 'deblocage'));

comment on table public.crm_mcp_card_events is
  'Créations, lectures et gels de carte Pliant via le MCP. Sans PAN, sans expiration, sans cryptogramme.';

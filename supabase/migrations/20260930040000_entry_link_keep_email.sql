-- Le code court reste. On rattache l’e-mail manquant quand le titulaire
-- est encore connu, pour pouvoir rouvrir la session après les 24 h du jeton.

update public.crm_entry_links as link
set email = lower(token.relates_to)
from auth.one_time_tokens as token
where token.token_hash = link.token_hash
  and coalesce(btrim(link.email), '') = ''
  and token.relates_to ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

update public.crm_entry_links as link
set email = lower(account.email)
from auth.users as account
where account.recovery_token = link.token_hash
  and coalesce(btrim(link.email), '') = ''
  and coalesce(btrim(account.email), '') <> '';

update public.crm_entry_links as link
set email = lower(account.email)
from auth.users as account
where account.confirmation_token = link.token_hash
  and coalesce(btrim(link.email), '') = ''
  and coalesce(btrim(account.email), '') <> '';

update public.crm_entry_links as link
set email = found.email
from (
  select entry.code, min(lower(customer.email)) as email
  from public.crm_entry_links as entry
  join public.crm_whatsapp_messages as message
    on message.created_at between entry.created_at - interval '3 seconds'
                              and entry.created_at + interval '3 seconds'
   and message.direction = 'outbound'
  join public.crm_customers as customer on customer.id = message.customer_id
  where coalesce(btrim(entry.email), '') = ''
    and coalesce(btrim(customer.email), '') <> ''
  group by entry.code
  having count(distinct customer.id) = 1
) as found
where link.code = found.code
  and coalesce(btrim(link.email), '') = '';

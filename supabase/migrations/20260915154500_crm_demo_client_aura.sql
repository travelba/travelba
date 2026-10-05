-- AVERTISSEMENT : seed de démo (Marie Dupont) déjà appliqué en prod, laissé ici parce qu'une
-- migration poussée ne se déplace pas. Ne pas rejouer en prod ni « reset » : il écraserait une
-- vraie fiche portant cet e-mail. Les prochains seeds vont dans supabase/seed.sql, jamais ici.
-- Client exemple Aura (Marie Dupont) — idempotent
insert into public.crm_customers (email, first_name, last_name, phone, language, city, country)
values ('client.demo@travelba.fr', 'Marie', 'Dupont', '+33612345678', 'fr', 'Paris', 'France')
on conflict (email) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  phone = excluded.phone;

-- Note: related bookings/items/txs seeded in prod via agent SQL (TBA-DEMO-0001).

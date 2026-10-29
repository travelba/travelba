# Seven sandbox certification bookings

Run these on **sandbox** only (`RATEHAWK_ENV=sandbox`, base URL `https://api-sandbox.ratehawk.com`). Production keys must not be present. Each booking needs a real adult name (letters, space, hyphen, apostrophe). Do not use Test, Guest, Child, or xxx.

Before the first booking:

1. Apply migration `supabase/migrations/20261021150000_ratehawk.sql` on the Supabase project.
2. Set `RATEHAWK_KEY_ID`, `RATEHAWK_API_KEY`, and `RATEHAWK_AGENCY_EMAIL` (agency domain) on the environment that will call ETG.
3. Whitelist the egress IP ([egress.md](./egress.md)). Without it, ETG returns `not_allowed_host` and the booking fails.
4. Sign in as staff and open `/admin/ratehawk`. The banner must show `sandbox`, payment `deposit`, prebook increase `10 %`, and both hids mapped (`10004834` and `8819557`). If it says « manquant », the migration is not applied.
5. Pick dates inside the sandbox window ETG documents for test hotels, within 30 nights and 730 days. If a search returns no rates, move the dates; do not invent a price.

After each attempt, copy `partner_order_id` from **Statut** into [checklist.md](./checklist.md). The same id is in **Réservations** and in `crm_ratehawk_bookings`. Request and response bodies for ETG are in `crm_ratehawk_logs` (authorization redacted). Export that booking’s rows for the ETG log sample.

Status on screen: **En cours / In progress**, **Confirmée / Success**, **Échouée / Failed**.

## 1. Multiroom — hid 10004834

1. Click **2 chambres, enfants**. Destination becomes Conrad Los Angeles, residency `fr`, room 1 is 2 adults and child 3, room 2 is 2 adults and children 1, 5, and 17.
2. Set arrival and departure. Click **Chercher**.
3. On Conrad Los Angeles, click **Voir les tarifs**. Choose one rate (same room type for both rooms). Click **Pré-réserver**.
4. If the champagne box says the price rose, tick **Continuer avec ce prix**.
5. Enter a real adult first and last name in each room. Leave **Scénario bac à sable** on **Réservation normale**.
6. Click **Réserver**. If a second box shows the form amount, click **Confirmer et réserver**.
7. Wait until **Confirmée / Success**. Record `partner_order_id`.

## 2. Uzbekistan citizenship — hid 10004834

1. Click **Ouzbékistan, 2 adultes**. Residency is `uz`, one room, 2 adults, no children, hid 10004834.
2. Search, open rates, prebook, accept a price rise if shown.
3. One real adult name. Scenario **Réservation normale**.
4. Book. Record the successful `partner_order_id`.

## 3. Monaco, children 0 and 17 — hid 10004834

1. Click **Monaco, 0 et 17 ans**. Residency is `mc`, one room, 2 adults, children 0 and 17.
2. Search, open rates, prebook, names (one adult required; child names optional).
3. Scenario **Réservation normale**. Book. Record the successful `partner_order_id`.

## 4. Prebook increase 10% — hid 8819557

1. Confirm the banner says hausse pré-réservation **10 %**. That value is `RATEHAWK_PRICE_INCREASE_PERCENT` and is sent as `price_increase_percent`.
2. Click **Hausse 10 % (8819557)**. Destination is Rosa Bell Motel, residency `fr`, one room, 2 adults.
3. Search, **Voir les tarifs**, **Pré-réserver**.
4. The price-change box must be accepted when ETG returns a higher `show_amount` (**Continuer avec ce prix**).
5. One real adult name. Scenario **Réservation normale**. Book. Record the successful `partner_order_id`.

## 5. unknown → success

1. Any sandbox hotel with a rate (Conrad Los Angeles is enough). One room, 2 adults, residency `fr` is fine.
2. Prebook and accept the price if it rose.
3. Set **Scénario bac à sable** to **unknown puis succès**. The `partner_order_id` ends with `unknown_success`. If the form is retried, the new id keeps that suffix.
4. Book. Finish and status return `unknown` first; keep the screen open. Success is only **Confirmée / Success**. Record that `partner_order_id`.

## 6. unknown → soldout

1. Same search shape as scenario 5.
2. Scenario **unknown puis complet**. The id ends with `unknown_soldout`.
3. Book and wait. The screen must end on **Échouée / Failed** with reason `soldout`. Record that `partner_order_id` (this one is a failed booking, as ETG asks).

## 7. unknown → book_limit

1. Same search shape as scenario 5.
2. Scenario **unknown puis book_limit**. The id ends with `unknown_book_limit`.
3. Book and wait. The screen must end on **Échouée / Failed** with reason `book_limit`. Record that `partner_order_id`.

## Cancellation spot check

On one **Confirmée** row, click **Annuler**. ETG cancel is called once. A timeout triggers exactly one more call. The row becomes **Annulée / Cancelled**. Do not cancel the three failed unknown scenarios; they never reached success.

## What this run does not change

The hotel line on a CRM dossier stays hidden and is not debited. Showing it to the client is a separate agency action on the dossier, outside these tests.

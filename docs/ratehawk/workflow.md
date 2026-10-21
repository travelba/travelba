# Ratehawk / ETG v3 — workflow

Travel BA calls ETG only from the server (`lib/crm/ratehawk`). The agency works in `/admin/ratehawk`. Sandbox host is `https://api-sandbox.ratehawk.com`. Production host is `https://api.ratehawk.com`. Keys, host, and stored rows never cross environments.

Hotelpage and prebook are not cached. Each open and each prebook is a live call. Search reads hotel names and room static data from Supabase, filled by the daily content job, and never calls the Content API.

| Step | What the agency does | ETG endpoint |
| --- | --- | --- |
| 1. Destination | Types a city or a hotel. The screen reads `crm_ratehawk_regions` and `crm_ratehawk_hotels`. Certification hotels hid `10004834` and `8819557` and region `2011` are always offered. | None |
| 2. Search | Sets arrival, departure, passport country (residency), rooms (up to 9, same room type), adults (1–6), child ages (0–17, up to 4). Clicks **Chercher**. A region calls region search. Coordinates without a destination call geo search. A hotel calls hotel-ids search (at most 300 hids). | `POST /api/b2b/v3/search/serp/region/` or `/serp/geo/` or `/serp/hotels/` |
| 3. Results | Sees up to two lowest net rates per hotel (`show_amount`). Those rates are not bookable. Clicks **Voir les tarifs**. | None |
| 4. Hotel page | Opens one hotel. Rates show `room_name` unchanged, meal label that is never an upgrade, net `show_amount`, agency sell price, excluded taxes apart, cancellation penalties in Paris time, room images and amenities when `rg_ext` matches, and hotel policies from the stored `metapolicy_struct` / `metapolicy_extra_info`. | `POST /api/b2b/v3/search/hp/` |
| 5. Prebook | Clicks **Pré-réserver** on a hotelpage hash (`h-`). | `POST /api/b2b/v3/hotel/prebook/` with `hash` and `price_increase_percent` |
| 6. Price change | If the prebook `show_amount` rose, the screen asks to tick **Continuer avec ce prix** before booking. | None |
| 7. Guests | Enters at least one real adult name per room. Child names are optional; a named child keeps the searched age. Optional dossier reference. Sandbox scenario, if any, is chosen here. Clicks **Réserver**. | None |
| 8. Booking form | The server creates a `partner_order_id` and requests the form. `user_ip` is the staff request IP. | `POST /api/b2b/v3/hotel/order/booking/form/` |
| 9. Form price | If the form charge amount is above the prebook amount, the row stays `price_review` and the screen asks **Confirmer et réserver**. Finish reuses the same `partner_order_id`. The form is not called again. | None |
| 10. Start booking | The server sends finish. `user.email` is the agency address from `RATEHAWK_AGENCY_EMAIL`. `payment_type` is copied from the form (`amount`, `currency_code`, configured type). A finish `ok` is not a success. The screen shows **En cours / In progress**. | `POST /api/b2b/v3/hotel/order/booking/finish/` |
| 11. Status | The screen polls about every 5 seconds until success, a final error, or the cut-off (default 180 seconds). The last status call is in the last second. Success is only `status: ok` and no error. | `POST /api/b2b/v3/hotel/order/booking/finish/status/` |
| 12. Webhook | Optional. ETG may POST the booking. The payload is stored. It does not confirm or fail the booking. | `POST /api/webhooks/ratehawk` on travelba.fr |
| 13. Order info | After success, and only after the delay (default 60 seconds, minimum 30), a later status refresh loads the order. It is not used to decide success. | `POST /api/b2b/v3/hotel/order/info/` |
| 14. Dossier | On success, if a dossier reference matches a CRM booking, a hidden hotel line is added (`visible_to_client` false, `include_in_ledger` false). A link failure does not cancel the ETG booking. | None |
| 15. Cancel | On a confirmed booking, the agency clicks **Annuler**. One retry, and only on timeout. | `POST /api/b2b/v3/hotel/order/cancel/` |
| Static, daily | Cron `10 4 * * *` UTC. Not part of a guest search. | `POST /api/content/v1/filter_values`, `/api/content/v1/hotel_ids_by_filter/`, `/api/content/v1/hotel_content_by_ids/`, `POST /api/b2b/v3/hotel/region/dump/` |

## Client timeouts

| Call | Client abort | Notes |
| --- | --- | --- |
| SERP and hotelpage | `timeout + 5` seconds | Body `timeout` is an integer, default 30, maximum 30. |
| Prebook | 60 seconds | Fixed. No `timeout` field. `price_increase_percent` default 10 (0–100). |
| Booking form | 20 seconds | Up to 10 attempts, then the search must restart. |
| Finish | 60 seconds | `ok`, timeout, unknown, and 5xx go to status. |
| Status | 30 seconds | Poll every 5 seconds inside the cut-off. |
| Cancel | 30 seconds | Second call only when the first timed out. |
| Order info | 30 seconds | After success, after `RATEHAWK_ORDER_INFO_DELAY_SECONDS`. |

## Search body

`checkin`, `checkout`, `residency` (lowercase ISO 3166-1 alpha-2), `language` (`en` on sandbox, `fr` in production), `guests: [{ adults, children: [ages] }]`, `currency` (default `EUR`), `timeout`.

Limits: 9 rooms, 6 adults per room, 4 children per room, child age 0–17, 30 nights, check-in within 730 days, 300 hids.

## Payment and price

`RATEHAWK_PAYMENT_TYPE` is `deposit` by default, or `hotel`, or `now`. Finish sends the matching `payment_types` entry from the form (configured type, otherwise `deposit`, otherwise the first). The amount is not recalculated.

Displayed net price is `show_amount` in the requested currency. `amount` is the contract charge. Taxes with `included_by_supplier: false` stay separate and are not added. Agency sell price is `round(net × (1 + margin/100), 2)` with margin at least 12 (`RATEHAWK_MARGIN_PERCENT`). `amount_sell_b2b2c` is sent only when that sell currency equals the form charge currency.

`now`, or a form that sets `is_need_credit_card_data` / `is_need_cvc`, fails closed. No card number is collected or stored.

## Egress

See [egress.md](./egress.md).

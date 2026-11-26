# Ratehawk / ETG v3 — workflow

Travel BA calls ETG only from the server (`lib/crm/ratehawk`). The agency works in `/admin/ratehawk`. Sandbox hosts are `https://api-sandbox.ratehawk.com` and `https://api-sandbox.worldota.net`. Production host is `https://api.ratehawk.com`. Keys, host, and stored rows never cross environments.

Hotelpage and prebook are not cached. Each open and each prebook is a live call. Search reads hotel names and room static data from Supabase, filled by the hourly content job. When a displayed hotel (at most 8) has no public name or address in Supabase, the agency screen route and the agency connector search (`ratehawk` / `rechercher`) complete it with `POST /api/content/v1/hotel_content_by_ids/` before answering. ETG documents that endpoint for offline sync, so this fallback should stay rare once the job has covered the destination.

| Step | What the agency does | ETG endpoint |
| --- | --- | --- |
| 1. Destination | Types a city or a hotel. The screen reads `crm_ratehawk_regions` and `crm_ratehawk_hotels`. Certification hotels hid `10004834` and `8819557` and region `2011` are always offered. | None |
| 2. Search | Sets arrival, departure, passport country (residency), rooms (up to 9, same room type), adults (1–6), child ages from a picker (0 = under 1 year, through 17, up to 4). Clicks **Chercher**. A region calls region search. Coordinates without a destination call geo search. A hotel calls hotel-ids search (at most 300 hids). | `POST /api/b2b/v3/search/serp/region/` or `/serp/geo/` or `/serp/hotels/` |
| 3. Results | Sees the static name, stars, address, and main photo. The string id and the hid are not shown, and rates are not listed here. Clicks **Voir les tarifs**. The hotel list folds and the screen moves to the selected hotel. | None |
| 4. Hotel page | Opens one hotel, marked **Hôtel sélectionné**: name, address, stars, description, amenities, check-in and check-out, photos, and policies parsed from `metapolicy_struct` plus `metapolicy_extra_info` (no raw JSON). Rates show `room_name`, meal, nights, rooms, guests, display amount and contract debit, agency price, taxes by name, and cancellation deadlines in the API time zone (UTC in sandbox, not Paris). **Pré-réserver** folds the other rates and opens the guest step. | `POST /api/b2b/v3/search/hp/` |
| 5. Prebook | Clicks **Pré-réserver** on a hotelpage hash (`h-`). | `POST /api/b2b/v3/hotel/prebook/` with `hash` and `price_increase_percent` |
| 6. Price change | If the prebook `show_amount` rose, the screen asks to tick **Continuer avec ce prix** before booking. | None |
| 7. Guests | Enters a phone of at least 5 characters (`user.phone`) and one real adult name per room. Child names are optional: an empty child is left out of finish; a partial or fake name shows the error on the button immediately, before any ETG call. **Réserver** switches to “Réservation en cours…” as soon as the names are valid. | None |
| 8. Booking form | The server creates a `partner_order_id` and requests the form. `user_ip` is the staff request IP, or the MCP caller IP. It must be an IPv4 or IPv6 address. A label is refused before the call. | `POST /api/b2b/v3/hotel/order/booking/form/` |
| 9. Form price | If the form charge amount is above the prebook amount, the row stays `price_review` and the screen asks **Confirmer et réserver**. Finish reuses the same `partner_order_id`. The form is not called again. | None |
| 10. Start booking | The server sends finish. `user.email` is the agency address from `RATEHAWK_AGENCY_EMAIL`. `user.phone` is the phone entered on the guest step (5–35 characters). `payment_type` is copied from the form (`amount`, `currency_code`, configured type). A finish `ok` is not a success. The screen shows **En cours / In progress**. | `POST /api/b2b/v3/hotel/order/booking/finish/` |
| 11. Status | The screen polls until success, a final error, or the cut-off. Expected wait **120 seconds**, hard stop **180 seconds**. The confirmation shows room, meal, dates, guests, cancellation, each tax, the display amount, and the contract amount that finish sent. Success is only `status: ok` and no error. | `POST /api/b2b/v3/hotel/order/booking/finish/status/` |
| 12. Webhook | Optional. ETG may POST the booking. The payload is stored. It does not confirm or fail the booking. | `POST /api/webhooks/ratehawk` on travelba.fr |
| 13. Order info | After success, and only after the delay (default 60 seconds, minimum 30), a later status refresh loads the order. It is not used to decide success. | `POST /api/b2b/v3/hotel/order/info/` |
| 14. Dossier | On success, if a dossier reference matches a CRM booking, a hidden hotel line is added (`visible_to_client` false, `include_in_ledger` false). A link failure does not cancel the ETG booking. | None |
| 15. Cancel | On a confirmed booking, the agency clicks **Annuler**. One retry, and only on timeout. | `POST /api/b2b/v3/hotel/order/cancel/` |
| Static, hourly | Cron `10 * * * *` UTC. Not part of a guest search. Sandbox: countries 59, 189, 201, 40 hotels per run, plus the certification hotels, no star filter. Production: every country from `filter_values`, France first, then the other country ids in ascending order. For each country, `hotel_ids_by_filter` is called with `star_rating: [4, 5]`, then with `star_rating: [3]` and `serp_filter: ["has_ski"]` (ETG label: ski slope nearby). There is no region filter on that endpoint, so ski resorts are not a curated region list. `preferable` is not set. A hotel whose content star is outside that lane is not written. Up to 3 000 stored hotels per run, chunks of 100. The cursor keeps the country, the lane (`stars` or `ski`), and the offset in the sorted hid list. A cursor from another environment, or from an older selection, keeps the region offset and starts the hotel list again. After a full cycle only hotels updated since the cycle start are read. Each stored row keeps 12 hotel photos, 4 photos per room group, and in `raw` only `images_ext`, `description_struct`, `amenity_groups`, and `policy_struct`. Regions: up to 20 000 per run, resumed by offset. Rows already stored are not deleted. | `GET /api/content/v1/filter_values`, `POST /api/content/v1/hotel_ids_by_filter/`, `POST /api/content/v1/hotel_content_by_ids/`, `POST /api/b2b/v3/hotel/region/dump/` |

## Client timeouts

| Call | Client abort | Notes |
| --- | --- | --- |
| SERP and hotelpage | 35 seconds | Body `timeout` is fixed at 30. Not dynamic. |
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

Payment type is always `deposit`. A `hotel` option is hidden and, if it is the only one on the form, the booking stops. Finish sends that deposit entry’s `amount` and `currency_code` unchanged.

The screen shows `show_amount` (requested currency, default EUR) and `amount` (contract currency, USD) from the same payment option. It does not convert between them. The confirmation repeats the `amount` that finish logged. Taxes with `included_by_supplier: false` stay separate and are not added. Agency sell price is `round(show_amount × (1 + margin/100), 2)` with margin at least 12 (`RATEHAWK_MARGIN_PERCENT`). `amount_sell_b2b2c` is sent only when that sell currency equals the form charge currency.

`now`, or a form that sets `is_need_credit_card_data` / `is_need_cvc`, fails closed. No card number is collected or stored.

## Egress

See [egress.md](./egress.md).

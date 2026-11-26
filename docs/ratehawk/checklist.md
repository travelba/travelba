# ETG pre-certification checklist — draft answers

Paste-ready draft for the Emerging Travel Group checklist. Items that still need a human, a key, or a static IP are marked **OPEN**. Test `partner_order_id` values are **OPEN**: no sandbox booking has been executed from this repository.

Product: Travel BA (Travel Business Agency), luxury IATA agency, France. Integration surface: staff website `/admin/ratehawk` on https://travelba.fr. Contract assumed API B2B, net rates, payment type `deposit`. Payment type is configurable.

## General

**Map hid 10004834, and hid 8819557 because prebook price-change is on.**  
Yes. Both hids and region 2011 (Los Angeles) are seeded in `crm_ratehawk_hotels` / `crm_ratehawk_regions` and are selectable before the first content sync. The daily job refreshes those two hids from Content API `hotel_content_by_ids` whenever keys are present.

**Product type for certification.**  
1. Website. Admin back-office, not a mobile app, not an API resold to third parties.

- Access to the website has been provided. — **No. OPEN.** Staff login has not been issued to ETG.
- Access cannot be granted; video attached. — Not yet. A recording can replace access if the agency prefers that.
- Mobile installation file. — Not applicable.
- Partner API documentation and logs for third parties. — Not applicable. Travel BA does not expose ETG to other integrators.

Logs of one completed test booking (ETG request and response) will be in `crm_ratehawk_logs` after the first sandbox booking. Secrets (Basic auth, key id, API key, proxy userinfo, card data) are redacted before insert.

## Test bookings

Record the id shown under **Statut** and in **Réservations** (`partner_order_id`). Steps: [certification-tests.md](./certification-tests.md).

| Scenario | partner_order_id |
| --- | --- |
| Multiroom, hid 10004834, 2 rooms: 2 adults + child 3 / 2 adults + children 1, 5, 17 | **OPEN** |
| Citizenship Uzbekistan, hid 10004834, 1 room, 2 adults | **OPEN** |
| Citizenship Monaco, hid 10004834, 1 room, 2 adults + children 0 and 17 | **OPEN** |
| Prebook +10%, hid 8819557, 1 room | **OPEN** |
| `unknown` then success (id ends with `unknown_success`) | **OPEN** |
| `unknown` then `soldout` (id ends with `unknown_soldout`) | **OPEN** |
| `unknown` then `book_limit` (id ends with `unknown_book_limit`) | **OPEN** |

## Workflow

Full table: [workflow.md](./workflow.md).

## IP whitelist

**OPEN.** No address list yet. Dynamic Vercel IPs will not be submitted. See [egress.md](./egress.md). After Vercel Static IPs on project `prj_NAEfKYyndp7T68G2wKOguSCgtPUr`, or after `RATEHAWK_HTTPS_PROXY` is set, paste the egress addresses here.

## Payment types

Developed and used: **`deposit` only** (B2B, partner deposit, net). A `hotel` or `now` option is not shown and is refused if it is the only payment type on the form. Finish copies `type: deposit`, `amount`, and `currency_code` from that booking-form entry. `RATEHAWK_PAYMENT_TYPE=hotel` is ignored.

`now` is not used. If the form requires card data, the booking fails closed. No PAN or CVC is collected. Sandbox does not support card payment.

## RPM estimates

Luxury desk, a small number of staff, no public metasearch. Figures are requests per minute we ask ETG to allow.

| Endpoint | Expected RPM |
| --- | --- |
| `/api/b2b/v3/search/serp/hotels/` | 30 |
| `/api/b2b/v3/search/serp/region/` | 20 |
| `/api/b2b/v3/search/serp/geo/` | 10 |
| `/api/b2b/v3/search/hp/` | 60 |
| `/api/b2b/v3/hotel/prebook/` | 30 |

These two figures are the capacity we ask ETG to allow (`RATEHAWK_REQUESTED_RPM` in `lib/crm/ratehawk/limits.ts`). They are not a limiter in the application, and nothing fans the calls out.

- `/search/hp`: one request each time an agent opens a hotel. No cache, no loop.
- `/hotel/prebook`: one request each time an agent clicks Pré-réserver. No retry loop.

A few people work the desk at once. 60 and 30 are headroom for that, not measured traffic and not a metasearch. Booking form, finish, and status stay one flow at a time (status about every 5 seconds, client poll 15 seconds, hard stop 180 seconds).
| `/api/b2b/v3/search/serp/prebook/` or `/hotel` SERP prebook | **0 — not called** |

Booking form, finish, finish/status, cancel, and order/info are low volume (one booking flow at a time per agent, status every 5 seconds for at most 180 seconds). Content calls are one cron an hour, not search traffic.

## Static data

**How hotel static data is received.**  
We use the Content API. We download static data and store it in our database (`crm_ratehawk_hotels`). Search and the hotel page read that database. A displayed hotel with no public name or address is completed from the Content API before the answer. The hourly job is the catalogue.

We do not use `/hotel/info/dump/`, `/hotel/info/incremental_dump/`, live `/hotel/info`, or a third-party mapper (GIATA, Vervotech).

Hourly job (`10 * * * *` UTC, `/api/cron/ratehawk-content`):

- Sandbox refreshes certification hids `10004834` and `8819557` via `POST /api/content/v1/hotel_content_by_ids/`. Production does not mix those test hotels into the catalogue.
- `GET /api/content/v1/filter_values`, then `POST /api/content/v1/hotel_ids_by_filter/` with `country` and, after a full country cycle, `updated_since` (`YYYY-MM-DD HH:MM:SS`).
- Sandbox country filter is limited to ids 59, 189, and 201, up to 40 hotels, chunks of 10.
- Production walks every country (France first). Each country asks for `star_rating` 4 and 5, then for 3-star hotels with `serp_filter` `has_ski` (ski slope nearby). Up to 3 000 stored hotels per run, chunks of 100.
- Regions: `POST /api/b2b/v3/hotel/region/dump/` (`language: en`), download the `.jsonl.zst` through the same egress, store regions. The dump is skipped when a full file was stored in the last 20 hours. A file over 80 MB or a run that stops at 20 000 regions is retried on a later run and does not mark the region list complete.

**Update frequency.** Hotels: hourly. Region dump: at most once the previous full file is older than 20 hours (ETG allows weekly).

**Destinations for `/serp/region`.**  
`POST /api/b2b/v3/hotel/region/dump/`. Region ids come from that file. Frequency: daily, with the cap above.

**Hotel and region mapping.**  
Not the full catalogue yet.

- Mapped now, in the migration seed: **2 hotels** (hid 10004834 Conrad Los Angeles, hid 8819557 Rosa Bell Motel) and **1 region** (id 2011 Los Angeles).
- After the first successful cron with sandbox keys: those 2 hotels refreshed, plus up to 40 hotels per run for the sandbox countries, and up to 20 000 regions per dump download.
- Production stores 4-star and 5-star hotels in every country, plus 3-star hotels with a ski slope nearby (`has_ski`), grown by `updated_since` after the first full pass. It is not a real-time content call. Search still fills a displayed hotel that has no name or address, whatever its star rating.

**Room static data.**  
Yes. Images and amenities are shown when the rate `rg_ext` equals the static room group on every field: `class`, `quality`, `sex`, `bathroom`, `bedding`, `family`, `capacity`, `club`, `bedrooms`, `balcony`, `view`, `floor` (missing counts as 0). Image templates replace `{size}` with `640x400`.

## Search

**match_hash.** No. We do not read or send `match_hash`.

**Prebook.** From the hotel page only (hash `h-`), never from SERP.

- `price_increase_percent`: default **10**. Configurable 0–100 via `RATEHAWK_PRICE_INCREASE_PERCENT`. The agency must accept a higher `show_amount` before finish.
- Timeout: **60 seconds**. Yes, within the ETG limit.

**Multiroom.** Yes, same room type only. One hotelpage rate (one `book_hash`) covers every room of the search, up to 9. Different room types in one booking are not offered.

**Dynamic search timeout.** No. Both values are 30 seconds, so the request `timeout` is fixed at **30** (`SEARCH_TIMEOUT_SECONDS`). It is not read from the environment and it does not move between calls. The HTTP client waits 35 seconds so it does not cut ETG’s 30 seconds short.

- Expected search timeout: **30 seconds**.
- Maximum search timeout: **30 seconds**.

**Final price.** Both numbers from the same `payment_types` entry are shown, copied as returned:

- `show_amount` + `show_currency_code` — display currency (request `currency`, default EUR).
- `amount` + `currency_code` — the deposit debit in the contract currency (USD on this contract).

We do not convert one into the other. ETG’s `show_amount` is not a market-rate conversion of `amount` (`commission_info.show` vs `commission_info.charge`), which is why a converted euro figure did not match the logged dollar amount. The confirmation shows the `amount` that finish sends and that the log records. The agency price is `show_amount` plus at least 12%, labeled apart, and is not the deposit. Excluded taxes stay separate and are not added. Tax codes are shown in French (`city_tax` → Taxe de séjour). Each rate also shows nights, rooms, and guests.

**Commission.** On the **partner’s** side. At least 12% of the net `show_amount` on every accommodation. `RATEHAWK_MARGIN_PERCENT` below 12 is raised to 12.

**Rate name.** **`room_name`** from the hotel search step (hotelpage and SERP). Shown as returned.

**Rooms from other suppliers.** We display ETG room names as they are. We do not map ETG rooms to other suppliers.

## Booking

**Final booking status shown to the user.**  
Status OK in **Check booking process** (`/order/booking/finish/status/`) only. One indicator.

**Webhook.** Implemented at `https://travelba.fr/api/webhooks/ratehawk` with `Authorization: Bearer <RATEHAWK_WEBHOOK_TOKEN>`. **The URL has not been sent to ETG (answer: No).** The webhook does not confirm the booking.

**Booking cut-off.** ETG has no dynamic booking timeout. Please set the cut-off on the key to match:

- Expected booking timeout: **120 seconds** (`BOOKING_EXPECTED_SECONDS`). We do not stop at 120.
- Maximum booking timeout: **180 seconds** (`BOOKING_MAX_SECONDS`). After that we show Failed with reason `booking_cutoff` and we stop calling status. An environment value cannot shorten this.

**Errors and statuses.** Tables for finish and finish/status, plus form and cancel: [errors.md](./errors.md).

**Confirmation email (`user.email`).**  
We send our **corporate** email address (`RATEHAWK_AGENCY_EMAIL`). We do not send the guest’s address. **OPEN:** the agency must set that address in Vercel before any booking. It is not hardcoded.

**Contact phone (`user.phone`).**  
Required on the guest step (at least 5 characters, at most 35). The value entered on the form is what finish sends. `RATEHAWK_AGENCY_PHONE` only prefills that field when it is already long enough.

## Post-booking

**Retrieve bookings (`/order/info`).** Yes.

- Purpose: allow the agency to store booking details after the flow. **Not** to confirm the final status.
- When: **after** the booking flow, once Check booking process has returned `ok`.
- Time gap: **yes, 60 seconds** by default (`RATEHAWK_ORDER_INFO_DELAY_SECONDS`, minimum 30, maximum 3600).

**Cancel.** Integrated. One extra call only when the first response is a timeout.

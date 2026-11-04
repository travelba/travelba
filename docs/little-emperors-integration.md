# Little Emperors integration

Travelba calls Little Emperors only from the server, inside the signed-in client space. The client never receives net rates, commissions, supplier names, or logos. Marketing copy from Little Emperors is not reproduced.

## Endpoints in use

- `GET /v2/hotels/bookings` — list and match an existing reservation
- `GET /v2/hotels/{id}` — hotel file used by the client search
- `POST /v2/hotels/availability` — search, and a fresh quote just before payment and just before booking
- `POST /v2/hotels/bookings` — create a stay, only for a client with live hotel access
- `DELETE /v2/hotels/bookings/{id}` — client cancellation when the live policy is free before the deadline

The base URL is `LITTLE_EMPERORS_API_BASE` (staging `https://api-staging.littleemperors.com` outside production). No new environment variable.

## Caching and limits

Hotel search results are cached in memory for about ten minutes. Empty results expire after about twenty seconds. Place suggestions use the same ten-minute window. Calls stay on the server. Timeouts and upstream errors surface as a French message; they are not retried in a loop.

## Booking journey

`HotelBookPort` remains the booking interface (`recheck`, `book`, `cancel`).

- Without live access (`hotel_direct_live`), or when the offer is not a partner rate, or when the API key is absent: `direct_email`. The agency emails the hotel. Nothing is created upstream.
- With live access, a partner rate and a configured key: `book()` returns `place`. The orchestrator then runs the create call. The port itself does not invent a confirmation number.

The price shown and charged is `total_to_book` (requested currency, then the supplier total). This path does not add the 12% margin used for net accounts.

Order, for a live stay:

1. Refresh availability before the card form. A price change is shown and no PaymentIntent is created until the client confirms the new amount.
2. Authorize the client’s card with Stripe (manual capture, seven-day hold).
3. Issue one single-use Pliant card for that exact amount.
4. Refresh availability again. A further price change releases the authorization, freezes the Pliant card, and shows the new price. No booking is sent.
5. `POST /v2/hotels/bookings` with the agency card in `credit_card`. The client never sees the supplier card form.
6. On success: store the booking id, confirmation number and cancellation deadline, capture Stripe, and email the client. On failure: release the authorization and freeze the card.

A second click reuses the same stay. If the upstream id is already stored, the call is not repeated. A session that has expired is refreshed once; if the price moved, the client sees it before any charge.

Cancellation uses the supplier’s `cancellation_deadline`, shown in Europe/Paris. After that instant the client cannot cancel alone. A successful self-service `DELETE` refunds the captured Stripe payment.

Webhooks still accept `X-Access-Key` or `Authorization: Bearer`. A direct stay is linked by the stored booking id. Fuzzy matching remains the fallback for stays that were not created here.

Client screens, the confirmation email and the dossier do not name the supplier and do not show cost or commission. Card numbers and cryptograms are not stored or logged.

## Security

Columns added by migration `20261104161000_hotel_le_booking`: `le_hotel_id`, `le_session_id`, `le_rate_index`, `cancellation_deadline`, `requires_cvc`, `payment_description` on `crm_hotel_search_offers`, and `le_booking_id` on `crm_hotel_direct_stays`. Apply that migration before this code. No production environment variable changes.

Access is `hotel_booking_enabled` on the customer, default false, changed only by an administrator. The gold button follows the separate agency setting `hotel_button_visibility` (`authorized` by default). Search, price, booking, and payment routes refuse a client without access. New tables are `service_role` only, with row level security enabled. Stripe webhooks stay signed. Idempotency keys block a second stay, email, card, or debit. Card numbers are not stored or logged. The demo account cannot turn live mode on.

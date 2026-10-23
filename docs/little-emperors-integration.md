# Little Emperors integration

Travelba calls Little Emperors only from the server, inside the signed-in client space. The client never receives net rates, commissions, supplier names, or logos. Marketing copy from Little Emperors is not reproduced.

## Endpoints in use

Read and cancel only. No booking-creation call is made.

- `GET /v2/hotels/bookings` — list and match an existing reservation
- `GET /v2/hotels/{id}` — hotel file used by the client search
- `DELETE /v2/hotels/bookings/{id}` — client cancellation when the live policy is free before the deadline

Search and availability use the same authenticated client. There is no `POST /v2/hotels/bookings`.

## Caching and limits

Hotel search results are cached in memory for about ten minutes. Empty results expire after about twenty seconds. Place suggestions use the same ten-minute window. Calls stay on the server. Timeouts and upstream errors surface as a French message; they are not retried in a loop.

## Booking journey

The client journey does not depend on a Little Emperors create endpoint. `HotelBookPort` is the only booking interface (`recheck`, `book`, `cancel`). The first implementation is `direct_email`: the agency emails the hotel, pays the hotel, and confirms when the hotel replies.

`littleEmperorsPort` stays unavailable. `book()` returns `not_contracted` even if a flag is passed. Wiring a future create endpoint means implementing that port and passing `leEndpoint: true` from the orchestrator. The client screens stay the same.

Partner rates (the amount Little Emperors asks the agency to book, never net plus markup) are named only in the hotel letter. Stripe capture waits until the hotel confirms the price.

## Security

Access is `hotel_booking_enabled` on the customer, default false, changed only by an administrator. The gold button follows the separate agency setting `hotel_button_visibility` (`authorized` by default). Search, price, booking, and payment routes refuse a client without access. New tables are `service_role` only, with row level security enabled. Stripe webhooks stay signed. Idempotency keys block a second stay, email, card, or debit. Card numbers are not stored or logged. The demo account cannot turn live mode on.

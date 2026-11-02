# Ratehawk / ETG v3 — error handling

Frontend copy on `/admin/ratehawk`:

| Internal status | French | English label shown beside it |
| --- | --- | --- |
| `in_progress` | En cours | In progress |
| `success` | Confirmée | Success |
| `failed` | Échouée | Failed |
| `cancelled` | Annulée | Cancelled |
| `price_review` | Prix à confirmer | In progress |

The only success signal is Check booking process (`/order/booking/finish/status/`) with `status: ok` and no `error`. Finish `ok`, webhook `confirmed` / `completed`, and `/order/info` do not mark a booking successful.

A new `partner_order_id` keeps a sandbox suffix (`unknown_success`, `unknown_soldout`, `unknown_book_limit`) when the previous id ended with that suffix.

## Create booking process — `/api/b2b/v3/hotel/order/booking/form/`

| ETG response | Frontend | Backend |
| --- | --- | --- |
| Status `ok` | In progress | Save the row. If the form charge is above the prebook amount and the agency has not accepted it, stay on `price_review` and do not call finish. Otherwise call `/order/booking/finish/`. |
| 5xx, HTTP 0, error `timeout`, error `unknown` | In progress | New `partner_order_id`, call form again. At most 10 attempts. Then stop, show Failed, reason kept, and the agency restarts search. |
| Error `double_booking_form` | In progress | New `partner_order_id`, call form again. Same cap of 10. |
| Error `duplicate_reservation` | In progress | New `partner_order_id`, call form again. Same cap of 10. |
| Error `contract_mismatch` | Failed | Stop. No finish, no status. |
| Error `hotel_not_found` | Failed | Stop. |
| Error `insufficient_b2b_balance` | Failed | Stop. |
| Error `reservation_is_not_allowed` | Failed | Stop. |
| Error `rate_not_found` | Failed | Stop. |
| Error `sandbox_restriction` | Failed | Stop. |
| Any other error | Failed | Stop. Reason is the ETG error code. |

Timeout, unknown, and 5xx on the form use a new `partner_order_id`, as in the Create booking error section (new id, maximum 10 calls), not a silent replay of the same id.

## Start booking process — `/api/b2b/v3/hotel/order/booking/finish/`

| ETG response | Frontend | Backend |
| --- | --- | --- |
| Status `ok` | In progress | This is not success. Poll `/order/booking/finish/status/` until success, a final error, or the cut-off. |
| 5xx status code | In progress | Poll status. Do not send finish again. |
| Error `timeout` | In progress | Poll status. |
| Error `unknown` | In progress | Poll status. |
| Error `booking_form_expired` | Failed | Stop. Show Failed. |
| Error `rate_not_found` | Failed | Stop. |
| Error `return_path_required` | Failed | Stop. |
| Error `book_hash_not_found` | Failed | Stop. |
| Error `chosen_payment_type_was_not_available_on_booking_form` | Failed | Stop. |
| Error `credit_card_required` | Failed | Stop. No card data is sent. |
| Error `double_booking_finish` | Failed | Stop. |
| Error `email` | Failed | Stop. |
| Error `incorrect_chosen_payment_type` | Failed | Stop. |
| Error `incorrect_guests_number` | Failed | Stop. |
| Error `incorrect_children_data` | Failed | Stop. |
| Error `incorrect_rooms_number` | Failed | Stop. |
| Error `insufficient_b2b_balance` | Failed | Stop. |
| Error `order_not_found` | Failed | Stop. |
| Error `unauthorized_group_booking` | Failed | Stop. |
| Error `arrival_date_differs_from_checkin_date` | Failed | Stop. |
| Error `not_enough_credit_card_data` | Failed | Stop. |
| Error `incorrect_init_uuid_format` | Failed | Stop. |
| Error `incorrect_pay_uuid_format` | Failed | Stop. |
| Error `sandbox_restriction` | Failed | Stop. |
| Error `supplier_data_required` | Failed | Stop. |
| Any other error | Failed | Stop. |

## Check booking process — `/api/b2b/v3/hotel/order/booking/finish/status/`

Poll every 5 seconds while the decision is pending and the cut-off (default 180 seconds from finish, clamp 30–300) is still ahead. The last call is placed in the last second before the cut-off. Our own expiry reason is `booking_cutoff` (it is not ETG `book_limit`).

| ETG response | Frontend | Backend |
| --- | --- | --- |
| Status `ok` and no error | Success | Stop. This is the only success. Then, after the order-info delay, `/order/info/` may load details. |
| Status `processing` | In progress | Keep polling inside the cut-off. |
| Error `timeout` | In progress | Keep polling inside the cut-off. |
| Error `unknown` | In progress | Keep polling inside the cut-off. |
| 5xx or HTTP 0 | In progress | Keep polling inside the cut-off. |
| Error `block` | Failed | Stop. |
| Error `charge` | Failed | Stop. |
| Error `3ds` | Failed | Stop. Deposit flow does not complete 3-D Secure. |
| Error `soldout` | Failed | Stop. |
| Error `provider` | Failed | Stop. |
| Error `book_limit` | Failed | Stop. |
| Error `not_allowed` | Failed | Stop. |
| Error `booking_finish_did_not_succeed` | Failed | Stop. |
| Error `decoding_json` | Failed | Stop. |
| Error `endpoint_exceeded_limit` | Failed | Stop. |
| Error `endpoint_not_active` | Failed | Stop. |
| Error `endpoint_not_found` | Failed | Stop. |
| Error `incorrect_credentials` | Failed | Stop. |
| Error `invalid_auth_header` | Failed | Stop. |
| Error `invalid_params` | Failed | Stop. |
| Error `lock` | Failed | Stop. |
| Error `no_auth_header` | Failed | Stop. |
| Error `not_allowed_host` | Failed | Stop. |
| Error `order_not_found` | Failed | Stop. |
| Error `overdue_debt` | Failed | Stop. |
| Error `unexpected_method` | Failed | Stop. |
| Any other error | Failed | Stop. |
| Still pending when the cut-off is reached, after a status call in the last second | Failed | Stop. Reason `booking_cutoff`. |

Status `price_review` is not polled. Polling before finish would return `booking_finish_did_not_succeed`.

## Cancel — `/api/b2b/v3/hotel/order/cancel/`

| ETG response | Frontend | Backend |
| --- | --- | --- |
| Status `ok` | Annulée / Cancelled | One call was enough. The CRM hotel line, if linked, becomes `lifecycle = cancelled`. |
| HTTP 0 or error `timeout`, first attempt | In progress until the retry returns | Call cancel once more. |
| Timeout on the second attempt, or any other error | Failed to cancel; the booking stays confirmed | Stop. Do not loop. |

## Webhook — `POST /api/webhooks/ratehawk`

| Payload | Effect |
| --- | --- |
| `confirmed` or `completed` | Stored on the row (`webhook_status`, `webhook_payload`). Booking status unchanged. |
| `failed` or `fail` | Stored. Booking status unchanged. |
| Anything else | Ignored, still answered 200 when the token matches and `partner_order_id` is present. |
| Missing token in env | 503. The URL is not ready to give to ETG. |
| Wrong bearer token | 401. |

## Retrieve bookings — `/api/b2b/v3/hotel/order/info/`

Called only when the row is already `success`, `order_info` is empty, and `confirmed_at` plus the delay has passed. The response is stored. It never moves the status to success or failed.

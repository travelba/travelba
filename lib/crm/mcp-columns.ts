/** Colonnes explicites des lectures MCP. Littéraux : le client Supabase type la ligne. */

export const MCP_BOOKING_COLUMNS =
  "id, customer_id, billing_customer_id, billing_company_id, payer_kind, fees_follow_stay, items_order_custom, owner_staff_id, created_by_staff_id, reference, title, destination, status, start_date, end_date, currency, total_amount, include_in_ledger, agency_commission, agency_fee_rate, fee_mode, client_settles_stay, cover_image_path, cover_credit, notes_client, notes_internal, visible_to_client, prices_visible, offer_chauffeur, offer_greeter, offer_checkin, offer_visa, archived_at, archived_was_visible, created_at, updated_at";

export const MCP_ITEM_COLUMNS =
  "id, booking_id, kind, title, supplier, confirmation_ref, start_at, end_at, amount, include_in_ledger, billing_company_id, sort_order, details, visible_to_client, source_document_id, lifecycle, superseded_by, created_at, updated_at";

export const MCP_CUSTOMER_SERVICE_COLUMNS = "id, first_name, last_name, sex, phone, whatsapp, email";

export const MCP_EMAIL_COLUMNS =
  "id, gmail_message_id, gmail_thread_id, label, from_email, subject, received_at, body_text, body_html, status, extract, candidates, attachments, warnings, suggested_customer_id, suggested_booking_id, created_booking_id, error, ignore_reason, crm_reply, grouped_into, confirmation_refs, match_tier, field_confidence, field_quotes, created_at, updated_at";

export const MCP_REVOLUT_COLUMNS =
  "id, revolut_transaction_id, amount, currency, direction, counterparty_name, counterparty_iban, reference, booked_at, raw, matched_customer_id, matched_transaction_id, matched_booking_id, settled_at, status, created_at, updated_at";

export const MCP_STRIPE_COLUMNS =
  "id, stripe_payment_intent_id, amount, currency, direction, payer_name, payer_email, reference, method, last4, booked_at, raw, matched_customer_id, matched_transaction_id, status, created_at, updated_at";

/** Sans `booked_at` : la migration `20261029140000_le_booked_at.sql` n’est pas en production. */
export const MCP_LE_STORED_COLUMNS =
  "le_booking_id, confirmation_number, state, hotel_id, hotel_name, city, address, check_in, check_out, currency, total_cost, guest_names, cancellation_policies, room_types, is_cancellable, cancellation_deadline, raw, crm_booking_id, created_at";

export const MCP_LE_LIST_COLUMNS =
  "id, le_booking_id, confirmation_number, state, hotel_id, hotel_name, city, country, check_in, check_out, guest_names, status, candidates, currency, total_cost, raw, created_at";

export const MCP_RESTAURANT_COLUMNS =
  "id, name, city, city_key, address, lat, lng, phone, website, categories, cuisine, style, booking_platform, booking_url, bot_reservable, guarantee_card, online_cancellation, cancel_hours, cancel_fee_cents, closed_weekdays, annual_closures, opening_hours, status, exclusion_reason, starred, prepaid_required, internal_note, photo_urls, menu_photo_url, signature_photo_url, concierge_pitch, price_band, price_estimated, place_url, availability_notes";

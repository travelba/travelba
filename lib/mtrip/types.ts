/** Types for the mTrip REST API (v1). Doc: https://doc.mtrip.com/ */

export type MtripTripType = "type_2" | "type_3" | "type_4";

export type MtripGeoLocation = {
  latitude: number;
  longitude: number;
};

export type MtripTravelerRole =
  | "traveler"
  | "tour_leader"
  | "lead_traveler"
  | "assistant"
  | "manager"
  | "booker"
  | "agent"
  | "approver"
  | string;

export type MtripDestination = {
  name: string;
  /** UNECE LOCODE city code */
  locode?: string;
  country_iso_code?: string;
  start_date?: string;
  end_date?: string;
  picture_url?: string;
  /** HTML */
  description?: string;
  location?: MtripGeoLocation;
  position?: number;
  active_for_every_traveler?: boolean;
  destinations_travelers_details?: Array<{ traveler_identifier: string }>;
};

export type MtripTraveler = {
  role?: MtripTravelerRole[];
  email?: string;
  first_name?: string;
  last_name?: string;
  booking_reference?: string;
  identifier?: string;
  /** 6–256 characters */
  password?: string;
  language?: string;
  phone?: string;
  /** 0 none · 1 send · other frequencies per docs */
  send_invitation_type?: number;
  send_invitation_sms?: boolean;
  guides?: string[];
  manager_first_name?: string;
  manager_last_name?: string;
  manager_email?: string;
  start_date?: string;
  end_date?: string;
};

export type MtripFlightService = {
  service_type?:
    | "fast"
    | "lounge"
    | "meet"
    | "park"
    | "vip"
    | "health"
    | "trsf"
    | "tour"
    | "boat"
    | string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  title?: string;
  description?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  airline_iata?: string;
  airport_iata?: string;
};

export type MtripFlightTravelerDetails = {
  traveler_identifier?: string;
  reservation_reference?: string;
  e_ticket?: string;
  class?: "Economy" | "Premium Economy" | "Business" | "First" | string;
  seat_number?: string;
  baggage_allowance?: string;
  benefits?: string;
  cancellation_conditions?: string;
  vcc_id?: string;
  vcc_provider?: "troovo" | "conferma" | string;
  frequent_flyer_number?: string;
};

export type MtripFlight = {
  departure_date?: string;
  arrival_date?: string;
  airline_iata?: string;
  departure_city?: string;
  arrival_city?: string;
  flight_number?: string;
  booking_reference?: string;
  airline?: string;
  departure_airport?: string;
  departure_airport_iata?: string;
  arrival_airport?: string;
  arrival_airport_iata?: string;
  departure_terminal?: string;
  arrival_terminal?: string;
  comments?: string;
  duration?: number;
  position?: number;
  aircraft?: string;
  operator?: string;
  operator_number?: string;
  identifier?: string;
  services?: MtripFlightService[];
  active_for_every_traveler?: boolean;
  flights_travelers_details?: MtripFlightTravelerDetails[];
  skip_sync_flight_details?: boolean;
};

export type MtripAccommodationTravelerDetails = {
  traveler_identifier?: string;
  booking_number?: string;
  type_of_room?: string;
  info?: string;
  cancellation_conditions?: string;
  vcc_id?: string;
  vcc_provider?: "troovo" | "conferma" | string;
};

export type MtripAccommodation = {
  name?: string;
  booking_number?: string;
  from_date?: string;
  to_date?: string;
  check_in_time?: string;
  check_out_time?: string;
  info?: string;
  location?: MtripGeoLocation;
  address?: string;
  picture_url?: string;
  type_of_room?: string;
  city?: string;
  phone?: string;
  website?: string;
  email?: string;
  chain_code?: string;
  active_for_every_traveler?: boolean;
  travelers_details?: MtripAccommodationTravelerDetails[];
  inventory_id?: string;
  identifier?: string;
  country_code?: string;
  state_code?: string;
  position?: number;
};

export type MtripDocument = {
  url: string;
  name?: string;
  description?: string;
  travelers?: string[];
};

export type MtripContact = {
  type?: "user" | "account" | "custom" | string;
  label?: string;
  identifier?: string;
  primary_id?: string;
  secondary_id?: string;
  email?: string;
  email_label?: string;
  phone?: string;
  phone_label?: string;
};

export type MtripPriceLine = {
  price?: number;
  segment_identifiers?: string[];
  text?: string;
};

export type MtripActivity = {
  date?: string;
  name?: string;
  identifier?: string;
  start_time?: string;
  end_time?: string;
  period?: string;
  type?: string;
  comments?: string;
  location?: MtripGeoLocation;
  duration?: number;
  position?: number;
  address?: string;
  website?: string;
  phone?: string;
  picture_url?: string;
  inventory_id?: string;
  optional_booking?: string;
  active_for_every_traveler?: boolean;
  app_trip_screen?: boolean;
  document_name?: string;
  country_code?: string;
  state_code?: string;
  reviewable?: boolean;
  reminder_minutes?: number;
  [key: string]: unknown;
};

export type MtripTrip = {
  name?: string;
  trip_type?: MtripTripType | string;
  identifier?: string;
  mtrip_account_id?: number;
  primary_id?: string;
  secondary_id?: string;
  start_date: string;
  end_date: string;
  description?: string;
  destinations: MtripDestination[];
  travelers: MtripTraveler[];
  flights?: MtripFlight[];
  accommodations?: MtripAccommodation[];
  car_rentals?: Array<Record<string, unknown>>;
  trains?: Array<Record<string, unknown>>;
  cruises?: Array<Record<string, unknown>>;
  transports?: Array<Record<string, unknown>>;
  activities?: MtripActivity[];
  documents?: MtripDocument[];
  trip_information_documents?: Record<string, unknown>;
  picture_url?: string;
  sort_items_by_position?: boolean;
  template_id?: string;
  status?: "draft" | "published" | string;
  trip_update_notifications?: string;
  booking_status?: "pending" | "confirmed" | "cancelled" | string;
  booking_visibility?: boolean;
  contacts?: MtripContact[];
  prices?: MtripPriceLine[];
  price_currency?: string;
  total_price?: number;
  price_note?: string;
};

export type MtripAccountIdentifier = {
  source: string;
  primary_id: string | null;
  secondary_id: string | null;
};

export type MtripAccount = {
  name: string;
  agency_id: number;
  in_app_messaging_email?: string | null;
  office_id?: string | null;
  corporate_id?: string | null;
  identifiers?: MtripAccountIdentifier[];
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  description?: string | null;
  country?: string | null;
};

export type MtripAccountsResponse = {
  agencies: MtripAccount[];
};

export type MtripHealthResponse = {
  healthy: boolean;
  monitors?: Array<{ name: string; healthy: boolean }>;
};

export type MtripTripIdCheckResponse = {
  trip_id?: number;
  message?: string;
};

export type MtripMobileAppLinkResponse = {
  url?: string;
  ios?: string;
  android?: string;
  [key: string]: unknown;
};

export type MtripCreateTravelerPayload = MtripTraveler & {
  trip_identifier?: string;
  [key: string]: unknown;
};

export type MtripInventory = {
  name: string;
  inventory_id: string;
  inventory_type: "activity" | "accommodation";
  activity_type?: string;
  description?: string;
  location?: string;
  address?: string;
  picture_url?: string[];
  city?: string;
  phone?: string;
  email?: string;
};

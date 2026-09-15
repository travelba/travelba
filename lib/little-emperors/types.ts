export type PredictiveSearchType = "hotel" | "location" | "inspiration";

export type PredictiveSearchItem = {
  id: number;
  text: string;
  type: PredictiveSearchType;
  location?: string;
};

export type AvailabilityRoomChild = {
  age: number;
};

export type AvailabilityRoom = {
  adults: number;
  children?: AvailabilityRoomChild[] | null;
};

export type AvailabilityRequest = {
  start_date: string;
  end_date: string;
  currency: string;
  rooms: AvailabilityRoom[];
  hotel_id?: number | null;
  location_id?: number | null;
  inspiration_id?: number | null;
  filters?: Record<string, unknown>;
};

export type MediaObject = {
  url?: string;
  thumbnail_url?: string;
  description?: string;
};

export type LowestRate = {
  requested_currency_code?: string;
  rate?: number;
  rate_in_requested_currency?: number;
  total_to_book?: number;
  total_to_book_in_requested_currency?: number;
  currency_code?: string;
  is_tax_included?: boolean;
};

export type RoomRate = {
  rate_index: string;
  title?: string;
  description?: string;
  additional_benefits?: string[];
  rate?: number;
  currency_code?: string;
  rate_in_requested_currency?: number;
  requested_currency_code?: string;
  total_to_book?: number;
  total_to_book_in_requested_currency?: number;
  is_tax_included?: boolean;
  cancellation_policy?: string;
  can_cancel?: boolean;
  cancellation_deadline?: string;
  payment_description?: string;
  benefits?: string[];
  stay_requirements?: string[];
};

export type RoomType = {
  id: number;
  name: string;
  description?: string;
  view_from_room?: string | null;
  unique_feature?: string | null;
  room_size?: string | null;
  bed_size?: string | null;
  images?: MediaObject[];
  rates?: RoomRate[];
  other_benefits?: string | null;
};

export type HotelAvailabilitySearchResultDetails = {
  images?: MediaObject[];
  description?: string;
  benefits?: string[];
  benefits_footnotes?: string[];
  location?: string;
  coords?: Array<string | number>;
};

export type HotelAvailability = {
  hotel_id: number;
  hotel_name: string;
  is_available: boolean;
  session_id?: string | null;
  default_currency?: string | null;
  hotel_info?: HotelAvailabilitySearchResultDetails | null;
  room_types?: RoomType[];
  lowest_rate?: LowestRate | null;
};

export type HotelDetails = {
  id: number;
  name: string;
  location?: string;
  address?: string;
  description?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  images?: MediaObject[];
  amenities?: Array<string | { name?: string; title?: string }>;
  benefits?: string[];
  short_info?: {
    images?: MediaObject[];
    description?: string;
  } | null;
};

export type CreateBookingRequest = {
  start_date: string;
  end_date: string;
  session_id: string;
  rate_index: string;
  hotel_id: number;
  guest_name: string;
  guest_email: string;
  rooms: Array<{
    adults: number;
    children?: AvailabilityRoomChild[] | null;
    guest_name?: string;
    guest_email?: string;
    send_email_to_guest?: boolean;
  }>;
  eta?: string | null;
  special_requests?: string | null;
};

export type Booking = {
  id: number;
  hotel_id?: number;
  hotel_name?: string;
  city?: string;
  check_in?: string;
  check_out?: string;
  state?: string;
  confirmation_number?: string;
  total_cost?: string;
  currency?: string;
  address?: string;
  is_cancellable?: boolean;
  cancellation_deadline?: string;
  rooms?: unknown[];
};

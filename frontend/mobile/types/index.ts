/**
 * Shared API types — mirror the backend module response schemas
 * (backend/app/modules/<name>/schema.py). Money/decimals arrive as strings.
 * Ported from frontend/web/types/index.ts, extended with the player-facing
 * booking/payment/review/equipment shapes web never needed.
 */

export type UserRole = 'player' | 'owner' | 'admin';

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  bio: string | null;
  preferred_sports: string[];
  preferred_locations: string[];
  profile_picture: string | null;
  created_at: string;
}

export interface RegisterResult {
  user: User;
  otp_sent_to: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const ARENA_CITIES = ['Lahore', 'Islamabad', 'Karachi', 'Multan'] as const;
export type ArenaCity = (typeof ARENA_CITIES)[number];

export interface DayHours {
  open: string;
  close: string;
}
export type OperatingHours = Record<string, DayHours>;

export interface RefundTier {
  hours_before: number;
  refund_percentage: number;
}

export interface Amenity {
  id: string;
  name: string;
  icon: string | null;
}

export interface Arena {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  address: string;
  city: ArenaCity;
  area: string | null;
  latitude: string;
  longitude: string;
  contact_phone: string | null;
  contact_email: string | null;
  operating_hours: OperatingHours;
  sports_offered: string[];
  images: string[];
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  advance_percentage: number;
  require_full_payment: boolean;
  refund_policy: RefundTier[];
  is_active: boolean;
  amenities: Amenity[];
  created_at: string;
}

export interface Court {
  id: string;
  arena_id: string;
  name: string;
  description: string | null;
  sport_types: string[];
  capacity: number | null;
  base_price: string;
  images: string[];
  is_available: boolean;
}

export type SlotStatus = 'available' | 'reserved' | 'booked' | 'maintenance';

export interface TimeSlot {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  price: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type BookingStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type PaymentPlan = 'full' | 'advance';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Booking {
  id: string;
  player_id: string;
  arena_id: string;
  court_id: string;
  slot_id: string;
  booking_group_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_amount: string;
  advance_amount: string;
  remaining_amount: string;
  payment_type: PaymentPlan;
  status: BookingStatus;
  payment_status: PaymentStatus;
  qr_code_url: string | null;
  cancellation_reason: string | null;
  refund_eligible: boolean;
  refund_percentage: number | null;
}

export interface BookingGroup {
  booking_group_id: string;
  bookings: Booking[];
}

export type PaymentMethod = 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer';

export interface Payment {
  id: string;
  booking_group_id: string;
  player_id: string;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  payment_provider: string;
  gateway_transaction_id: string | null;
  status: PaymentStatus;
  payment_type: PaymentPlan;
  receipt_proof_url: string | null;
}

export interface PaymentInitiateResult {
  payment: Payment;
  client_secret: string | null;
  redirect_url: string | null;
}

export interface Equipment {
  id: string;
  arena_id: string;
  name: string;
  description: string | null;
  rental_price: string;
  quantity_total: number;
  quantity_available: number;
  is_active: boolean;
}

export interface Review {
  id: string;
  player_id: string;
  reviewer_name: string;
  arena_id: string;
  booking_id: string;
  rating: number;
  review_text: string | null;
  owner_response: string | null;
  owner_response_at: string | null;
  is_flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface RatingSummary {
  average_rating: number | null;
  review_count: number;
}

export type MatchStatus = 'open' | 'full' | 'cancelled' | 'completed';

export interface MatchParticipant {
  player_id: string;
  player_name: string;
  joined_at: string;
}

export interface Match {
  id: string;
  creator_id: string;
  creator_name: string;
  arena_id: string;
  arena_name: string;
  city: ArenaCity;
  court_id: string;
  court_name: string;
  sport: string;
  match_date: string;
  start_time: string;
  end_time: string;
  max_players: number;
  players_joined: number;
  status: MatchStatus;
  created_at: string;
}

export interface MatchDetail extends Match {
  participants: MatchParticipant[];
}

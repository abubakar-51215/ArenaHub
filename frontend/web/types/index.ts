/**
 * Shared API types — mirror the backend module response schemas
 * (backend/app/modules/<name>/schema.py). Money/decimals arrive as strings.
 */

export type UserRole = "player" | "owner" | "admin";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  profile_picture: string | null;
  created_at: string;
}

export interface RegisterResult {
  user: User;
  /** OTP delivery channel used, so the client can prompt correctly. */
  otp_sent_to: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type ArenaStatus = "pending" | "approved" | "rejected";

// Cities ArenaHub currently operates in (single country: Pakistan, PKR).
export const ARENA_CITIES = ["Lahore", "Islamabad", "Karachi", "Multan"] as const;
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
  status: ArenaStatus;
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

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PricingRule {
  id: string;
  court_id: string;
  name: string;
  weekday: number | null;
  start_time: string;
  end_time: string;
  price_multiplier: string;
  is_active: boolean;
}

export type DiscountType = "percentage" | "fixed";

export interface DiscountCode {
  id: string;
  arena_id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: string;
  min_booking_amount: string;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export type BookingStatus =
  "pending_payment" | "pending_approval" | "confirmed" | "completed" | "cancelled" | "rejected";

export interface DashboardSummary {
  total_arenas: number;
  bookings_today: number;
  bookings_this_month: number;
  monthly_revenue: string;
  pending_approvals: number;
}

export interface PendingApproval {
  booking_id: string;
  arena_id: string;
  arena_name: string;
  court_id: string;
  player_id: string;
  player_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_amount: string;
  payment_id: string | null;
  payment_method: string | null;
  receipt_proof_url: string | null;
}

export interface CalendarBooking {
  id: string;
  court_id: string;
  player_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  total_amount: string;
}

export interface RevenueTrendPoint {
  date: string;
  amount: string;
}

export interface BookingsByHourPoint {
  hour: number;
  count: number;
}

export interface PeakHours {
  start_hour: number;
  end_hour: number;
}

export interface TopArenaItem {
  arena_id: string;
  name: string;
  revenue: string;
}

export interface RecentBookingItem {
  booking_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  court_name: string;
  arena_name: string;
  status: BookingStatus;
}

export interface DashboardAnalytics {
  total_revenue: string;
  revenue_change_pct: number | null;
  total_bookings: number;
  bookings_change_pct: number | null;
  peak_hours: PeakHours | null;
  occupancy_rate: number | null;
  occupancy_change_pts: number | null;
  revenue_trend: RevenueTrendPoint[];
  bookings_by_time: BookingsByHourPoint[];
  top_arenas: TopArenaItem[];
  recent_bookings: RecentBookingItem[];
}

export interface OwnerBookingRow {
  booking_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  arena_id: string;
  arena_name: string;
  court_id: string;
  court_name: string;
  player_name: string;
  total_amount: string;
  status: BookingStatus;
  payment_id: string | null;
  receipt_proof_url: string | null;
}

export interface RevenueBreakdownItem {
  id: string;
  amount: string;
}

export interface RevenueSummary {
  total_revenue: string;
  pending_settlements: string;
  breakdown_by_arena: RevenueBreakdownItem[];
  breakdown_by_court: RevenueBreakdownItem[];
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

export interface ModerationReview {
  id: string;
  arena_id: string;
  arena_name: string;
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  flag_reason: string | null;
  reporter_name: string | null;
  flagged_at: string | null;
  created_at: string;
}

export interface RatingSummary {
  average_rating: number | null;
  review_count: number;
}

// ---- admin panel --------------------------------------------------

export type PaymentMethod = "card" | "jazzcash" | "easypaisa" | "bank_transfer";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface DashboardMetrics {
  total_players: number;
  total_owners: number;
  total_arenas: number;
  pending_arenas: number;
  approved_arenas: number;
  rejected_arenas: number;
  bookings_today: number;
  bookings_this_month: number;
  bookings_all_time: number;
  total_revenue: number;
  active_complaints: number;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  total_bookings: number;
}

export interface AdminBooking {
  id: string;
  player_id: string;
  player_name: string;
  arena_id: string;
  arena_name: string;
  court_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_amount: string;
  payment_type: "full" | "advance";
  status: BookingStatus;
  created_at: string;
}

export interface AdminPayment {
  id: string;
  player_id: string;
  player_name: string;
  arena_name: string | null;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  gateway_transaction_id: string | null;
  status: PaymentStatus;
  created_at: string;
}

export type ComplaintCategory =
  | "booking_issue"
  | "payment_issue"
  | "arena_quality"
  | "owner_behavior"
  | "technical_problem"
  | "other";
export type ComplaintStatus = "open" | "under_review" | "resolved";

export interface Complaint {
  id: string;
  player_id: string;
  player_name: string;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  admin_response: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface EmailSettings {
  enabled: boolean;
  from_name: string;
}

export interface SmsSettings {
  enabled: boolean;
  provider: string;
}

export interface PaymentGatewaySettings {
  card_enabled: boolean;
  jazzcash_enabled: boolean;
  easypaisa_enabled: boolean;
  bank_transfer_enabled: boolean;
}

export interface BookingPolicySettings {
  default_advance_percentage: number;
  min_advance_hours: number;
  max_advance_days: number;
  auto_cancel_hours: number;
}

export interface NotificationSettings {
  booking_enabled: boolean;
  payment_enabled: boolean;
  reminder_enabled: boolean;
}

export interface PlatformSettings {
  site_name: string;
  site_description: string;
  site_email: string;
  site_phone: string;
  address: string;
  default_currency: string;
  timezone: string;
  email: EmailSettings;
  sms: SmsSettings;
  payment_gateways: PaymentGatewaySettings;
  booking_policy: BookingPolicySettings;
  notifications: NotificationSettings;
}

export const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

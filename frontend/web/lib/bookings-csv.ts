/**
 * The owner Bookings rows in the screen's own words: the booking reference, the payment ("Bank transfer · paid"),
 * and the CSV export (the same status words, money, dates and times as the table). Relative imports only, so
 * scripts/check-csv-words.mjs can load it with plain Node.
 */
import type { OwnerBookingRow } from "@/types";

import { formatDate, formatRs, formatTime } from "./format";
import { PAYMENT_METHOD_LABEL } from "./payment-methods";
import { statusLabel } from "./status-words";

/** The payment, in words, from the real payment: one of our four methods and
 *  its state ("Card · paid"), "Refunded" for a refunded one. */
export function paymentParts(row: OwnerBookingRow): { method: string; state: string | null } {
  if (!row.payment_method) return { method: row.status === "pending_payment" ? "Not paid yet" : "—", state: null };
  const method = PAYMENT_METHOD_LABEL[row.payment_method];
  if (row.payment_status === "refunded" || row.payment_lifecycle_status === "refunded")
    return { method, state: "refunded" };
  if (row.payment_status === "completed") return { method, state: "paid" };
  if (row.payment_status === "failed") return { method, state: "failed" };
  if (row.status === "pending_approval") return { method, state: "receipt to review" };
  return { method, state: "pending" };
}

/** One line, for the phone cards. */
export function paymentText(row: OwnerBookingRow): string {
  const { method, state } = paymentParts(row);
  return state ? `${method} · ${state}` : method;
}

/** The booking reference the player sees on the phone and writes on a bank transfer (AHB-xxxxxx). */
export function bookingRef(row: { booking_code?: string; booking_id: string }): string {
  return row.booking_code || `#BK-${row.booking_id.slice(0, 4).toUpperCase()}`;
}

/** One CSV field: quoted, with quotes doubled. */
const field = (v: string): string => `"${v.replace(/"/g, '""')}"`;

/** The rows as CSV with the screen's words: "AHB-1A2B3C", "Oct 14, 2026", "7:00 PM – 8:00 PM", "Awaiting payment",
 *  "Bank transfer · paid", "Rs. 2,000". */
export function bookingsCsv(rows: OwnerBookingRow[]): string {
  const header = ["Booking", "Date", "Time", "Arena", "Court", "Customer", "Status", "Payment", "Amount"];
  const lines = rows.map((r) =>
    [
      bookingRef(r),
      formatDate(r.booking_date),
      `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`,
      r.arena_name,
      r.court_name,
      r.player_name,
      statusLabel(r.status),
      paymentText(r),
      formatRs(r.total_amount),
    ]
      .map(field)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

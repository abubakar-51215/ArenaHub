"""Payment receipt PDF (docs/PROJECT_GUIDELINES.md Sprint 3 Track A bullet:
"receipt PDF"). Plain, single-page, no branding assets — enough for a
player to keep proof of payment.
"""

from fpdf import FPDF

from app.modules.booking.model import Booking
from app.modules.payment.model import Payment


def build_receipt_pdf(payment: Payment, bookings: list[Booking]) -> bytes:
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "ArenaHub - Payment Receipt", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.ln(4)
    pdf.cell(0, 8, f"Payment ID: {payment.id}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Status: {payment.status.value}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        8,
        f"Method: {payment.payment_method.value} ({payment.payment_provider})",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(0, 8, f"Amount: {payment.amount} {payment.currency}", new_x="LMARGIN", new_y="NEXT")
    if payment.gateway_transaction_id:
        pdf.cell(
            0, 8, f"Transaction ID: {payment.gateway_transaction_id}", new_x="LMARGIN", new_y="NEXT"
        )
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Bookings", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for booking in bookings:
        pdf.cell(
            0,
            8,
            f"{booking.booking_date} {booking.start_time}-{booking.end_time}  "
            f"PKR {booking.total_amount}  [{booking.status.value}]",
            new_x="LMARGIN",
            new_y="NEXT",
        )
    return bytes(pdf.output())

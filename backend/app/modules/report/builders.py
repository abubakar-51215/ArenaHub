"""CSV/PDF table renderers shared by every report. Deliberately dumb: a
title, a header row, and string cells — callers own formatting (currency,
dates, enum labels) before handing rows in here."""

import csv
import io

from fpdf import FPDF


def rows_to_csv(headers: list[str], rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def rows_to_pdf(title: str, headers: list[str], rows: list[list[str]]) -> bytes:
    pdf = FPDF(orientation="L", format="A4")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    col_width = pdf.epw / max(len(headers), 1)
    pdf.set_font("Helvetica", "B", 9)
    for header in headers:
        pdf.cell(col_width, 8, header, border=1)
    pdf.ln(8)

    pdf.set_font("Helvetica", "", 8)
    for row in rows:
        for cell in row:
            pdf.cell(col_width, 7, str(cell)[:40], border=1)
        pdf.ln(7)

    if not rows:
        pdf.cell(0, 8, "No data in the selected range.", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())

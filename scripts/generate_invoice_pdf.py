import base64
import io
import json
import sys

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


def money(cents):
    value = cents / 100
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"EUR {formatted}"


def date_nl(value):
    year, month, day = value.split("-")
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    return f"{int(day)} {months[int(month) - 1]} {year}"


def wrap_text(text, font_name, font_size, max_width, max_lines=None):
    words = str(text or "").split()
    if not words:
        return [""]
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and stringWidth(f"{lines[-1]}...", font_name, font_size) > max_width:
            lines[-1] = lines[-1][:-1].rstrip()
        lines[-1] = f"{lines[-1]}..."
    return lines


def draw_wrapped(page, text, x, y, font_name, font_size, color, max_width, line_height, max_lines=None):
    page.setFillColor(color)
    page.setFont(font_name, font_size)
    lines = wrap_text(text, font_name, font_size, max_width, max_lines)
    for index, line in enumerate(lines):
        page.drawString(x, y - (index * line_height), line)
    return len(lines)


def draw_company_logo(page, invoice, x, y, max_width, max_height):
    logo = invoice["company"].get("invoiceLogo", "")
    if not logo:
        return False
    try:
        _, payload = logo.split(",", 1)
        image = ImageReader(io.BytesIO(base64.b64decode(payload)))
        image_width, image_height = image.getSize()
        scale = min(max_width / image_width, max_height / image_height)
        width = image_width * scale
        height = image_height * scale
        page.drawImage(image, x, y - height, width=width, height=height, mask="auto")
        return True
    except Exception:
        return False


def create_pdf(invoice):
    output = io.BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    green = HexColor("#145B4D")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")
    pale = HexColor("#EDF5F2")

    if invoice["status"] == "Concept":
        page.saveState()
        page.setFillColor(HexColor("#F0F2EF"))
        page.setFont("Helvetica-Bold", 68)
        page.translate(width / 2, height / 2)
        page.rotate(35)
        page.drawCentredString(0, 0, "CONCEPT")
        page.restoreState()

    if not draw_company_logo(page, invoice, 42, height - 42, 125, 42):
        page.setFillColor(green)
        page.roundRect(42, height - 78, 30, 30, 8, fill=1, stroke=0)
        page.setFillColor(HexColor("#FFFFFF"))
        page.setFont("Helvetica-BoldOblique", 20)
        page.drawCentredString(57, height - 69, "h")
        page.setFillColor(dark)
        page.setFont("Helvetica-Bold", 17)
        page.drawString(82, height - 67, "helder")

    page.setFont("Helvetica-Bold", 25)
    page.drawRightString(width - 42, height - 58, "FACTUUR")
    page.setFont("Helvetica", 10)
    page.setFillColor(muted)
    page.drawRightString(width - 42, height - 76, invoice["id"])

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 9)
    page.drawString(42, height - 122, "VAN")
    page.drawString(305, height - 122, "FACTUUR AAN")
    page.setFont("Helvetica-Bold", 11)
    page.drawString(42, height - 141, invoice["company"]["name"])
    page.drawString(305, height - 141, invoice["customer"]["name"])
    page.setFont("Helvetica", 9)
    page.setFillColor(muted)
    page.drawString(42, height - 157, invoice["company"]["street"])
    page.drawString(42, height - 172, f'{invoice["company"]["postalCode"]} {invoice["company"]["city"]}')
    page.drawString(42, height - 187, invoice["company"]["email"])
    page.setFont("Helvetica", 7)
    page.drawString(42, height - 202, f'KVK {invoice["company"]["kvkNumber"]}  |  BTW-ID {invoice["company"]["vatNumber"]}')
    page.setFont("Helvetica", 9)
    customer_y = height - 157
    customer_contact = invoice["customer"].get("contact", "").strip()
    if customer_contact:
        page.drawString(305, customer_y, customer_contact)
        customer_y -= 15
    page.drawString(305, customer_y, invoice["customer"]["street"])
    customer_y -= 15
    page.drawString(305, customer_y, f'{invoice["customer"]["postalCode"]} {invoice["customer"]["city"]}')

    page.setFillColor(pale)
    page.roundRect(42, height - 252, width - 84, 42, 7, fill=1, stroke=0)
    page.setFillColor(muted)
    page.setFont("Helvetica-Bold", 7)
    page.drawString(56, height - 226, "FACTUURDATUM")
    page.drawString(220, height - 226, "VERVALDATUM")
    page.drawString(384, height - 226, "STATUS")
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 9)
    page.drawString(56, height - 242, date_nl(invoice["issueDate"]))
    page.drawString(220, height - 242, date_nl(invoice["dueDate"]))
    page.drawString(384, height - 242, invoice["status"])

    table_top = height - 292
    page.setFillColor(muted)
    page.setFont("Helvetica-Bold", 7)
    page.drawString(42, table_top, "OMSCHRIJVING")
    page.drawRightString(350, table_top, "AANTAL")
    page.drawRightString(440, table_top, "PRIJS")
    page.drawRightString(width - 42, table_top, "BEDRAG")
    page.setStrokeColor(line)
    page.line(42, table_top - 9, width - 42, table_top - 9)

    y = table_top - 31
    subtotal = 0
    vat_by_rate = {}
    for item in invoice["lines"]:
        line_total = round(item["quantity"] * item["unitPriceCents"])
        vat = round(line_total * item["vatRate"] / 100)
        subtotal += line_total
        vat_by_rate[item["vatRate"]] = vat_by_rate.get(item["vatRate"], 0) + vat
        description_lines = wrap_text(item["description"], "Helvetica-Bold", 9, 250, 4)
        page.setFillColor(dark)
        page.setFont("Helvetica-Bold", 9)
        for index, description_line in enumerate(description_lines):
            page.drawString(42, y - (index * 11), description_line)
        vat_y = y - (len(description_lines) * 11) - 2
        page.setFillColor(muted)
        page.setFont("Helvetica", 8)
        page.drawString(42, vat_y, f'{item["vatRate"]}% btw')
        page.drawRightString(350, y, str(item["quantity"]).rstrip("0").rstrip("."))
        page.drawRightString(440, y, money(item["unitPriceCents"]))
        page.setFillColor(dark)
        page.setFont("Helvetica-Bold", 9)
        page.drawRightString(width - 42, y, money(line_total))
        page.setStrokeColor(line)
        row_height = max(48, 35 + ((len(description_lines) - 1) * 11))
        page.line(42, y - row_height + 12, width - 42, y - row_height + 12)
        y -= row_height

    totals_y = max(y - 5, 235)
    left = 355
    page.setFont("Helvetica", 9)
    page.setFillColor(muted)
    page.drawString(left, totals_y, "Subtotaal")
    page.setFillColor(dark)
    page.drawRightString(width - 42, totals_y, money(subtotal))
    totals_y -= 22
    for rate, vat in sorted(vat_by_rate.items()):
        page.setFillColor(muted)
        page.drawString(left, totals_y, f"Btw {rate}%")
        page.setFillColor(dark)
        page.drawRightString(width - 42, totals_y, money(vat))
        totals_y -= 22
    page.setStrokeColor(dark)
    page.line(left, totals_y + 7, width - 42, totals_y + 7)
    page.setFont("Helvetica-Bold", 12)
    page.drawString(left, totals_y - 10, "Totaal")
    page.drawRightString(width - 42, totals_y - 10, money(invoice["totalCents"]))

    page.setFillColor(pale)
    page.roundRect(42, 62, width - 84, 65, 7, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 9)
    page.drawString(56, 105, "BETALING")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(56, 88, f'Maak {money(invoice["totalCents"])} over naar {invoice["company"]["iban"]} voor {date_nl(invoice["dueDate"])} o.v.v. {invoice["id"]}.')
    footer = invoice["company"].get("invoiceFooter", "").strip()
    if footer:
        page.setFillColor(muted)
        page.setFont("Helvetica", 8)
        draw_wrapped(page, footer, 56, 76, "Helvetica", 8, muted, width - 112, 9, 2)
    page.setFillColor(HexColor("#939C98"))
    page.setFont("Helvetica", 7)
    page.drawCentredString(width / 2, 38, "Gemaakt met Helder - administratie zonder omwegen")
    page.save()
    return output.getvalue()


invoice_data = json.load(sys.stdin)
sys.stdout.buffer.write(create_pdf(invoice_data))

import io
import json
import sys
from datetime import date

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def money(cents):
    value = cents / 100
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"EUR {formatted}"


def today_nl():
    today = date.today()
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    return f"{today.day} {months[today.month - 1]} {today.year}"


def draw_header(page, width, height, summary):
    green = HexColor("#145B4D")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")

    page.setFillColor(green)
    page.roundRect(36, height - 64, 27, 27, 7, fill=1, stroke=0)
    page.setFillColor(HexColor("#FFFFFF"))
    page.setFont("Helvetica-BoldOblique", 18)
    page.drawCentredString(49.5, height - 57, "h")
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(73, height - 55, "helder")
    page.setFont("Helvetica-Bold", 20)
    page.drawRightString(width - 36, height - 48, "CONCEPT JAARCHECK")
    page.setFont("Helvetica", 8)
    page.setFillColor(muted)
    page.drawRightString(width - 36, height - 63, f'{summary["year"]} - gemaakt op {today_nl()}')


def draw_footer(page, width):
    muted = HexColor("#939C98")
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawString(36, 24, "Praktische voorbereiding. Laat je boekhouder of adviseur de fiscale details controleren.")
    page.drawRightString(width - 36, 24, "Pagina 1")


def draw_card(page, x, y, w, h, title, amount, subtitle, dark_card=False):
    green_dark = HexColor("#173E35")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")

    if dark_card:
        page.setFillColor(green_dark)
        page.roundRect(x, y, w, h, 8, fill=1, stroke=0)
        title_color = HexColor("#C1D4CD")
        amount_color = HexColor("#FFFFFF")
        subtitle_color = HexColor("#C1D4CD")
    else:
        page.setFillColor(HexColor("#FFFFFF"))
        page.setStrokeColor(line)
        page.roundRect(x, y, w, h, 8, fill=1, stroke=1)
        title_color = muted
        amount_color = dark
        subtitle_color = muted

    page.setFillColor(title_color)
    page.setFont("Helvetica", 8)
    page.drawString(x + 15, y + h - 22, title)
    page.setFillColor(amount_color)
    page.setFont("Helvetica-Bold", 17)
    page.drawString(x + 15, y + h - 47, str(amount))
    page.setFillColor(subtitle_color)
    page.setFont("Helvetica", 7)
    page.drawString(x + 15, y + 15, subtitle)


def create_pdf(summary):
    output = io.BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4

    green = HexColor("#145B4D")
    green_dark = HexColor("#173E35")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    pale = HexColor("#EDF5F2")
    line = HexColor("#E5E7E2")

    draw_header(page, width, height, summary)

    checklist = summary["checklist"]
    completed = len([item for item in checklist if item["done"]])
    total = len(checklist)
    percentage = round(completed / total * 100) if total else 0

    page.setFillColor(pale)
    page.roundRect(36, height - 123, width - 72, 38, 7, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(50, height - 101, "LET OP")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(92, height - 101, "Dit is een praktische controlelijst. Het is geen definitieve belastingaangifte.")

    page.setFillColor(green_dark)
    page.roundRect(36, height - 244, width - 72, 86, 10, fill=1, stroke=0)
    page.setFillColor(HexColor("#C1D4CD"))
    page.setFont("Helvetica-Bold", 9)
    page.drawString(58, height - 188, "VOORTGANG")
    page.setFillColor(HexColor("#FFFFFF"))
    page.setFont("Helvetica-Bold", 28)
    page.drawString(58, height - 221, f"{completed} van {total} punten klaar")
    page.setFillColor(HexColor("#C1D4CD"))
    page.setFont("Helvetica", 8)
    page.drawRightString(width - 58, height - 206, f"{percentage}% gereed")

    card_y = height - 344
    card_w = (width - 92) / 3
    draw_card(page, 36, card_y, card_w, 64, "Definitieve facturen", summary["finalInvoiceCount"], "Concepten tellen niet mee")
    draw_card(page, 46 + card_w, card_y, card_w, 64, "Kosten zonder bon", summary["missingReceiptCount"], "Nog te controleren")
    draw_card(page, 56 + card_w * 2, card_y, card_w, 64, "Apart te houden", money(summary["reserveCents"]), "Btw plus grove winstbelasting", True)

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 14)
    page.drawString(36, height - 394, "Controlepunten")

    y = height - 426
    for item in checklist:
        page.setFillColor(HexColor("#FFFFFF"))
        page.setStrokeColor(line)
        page.roundRect(36, y - 36, width - 72, 45, 7, fill=1, stroke=1)
        page.setFillColor(green if item["done"] else HexColor("#9A4C43"))
        page.circle(55, y - 13, 7, fill=1, stroke=0)
        page.setFillColor(HexColor("#FFFFFF"))
        page.setFont("Helvetica-Bold", 8)
        page.setFont("Helvetica-Bold", 6 if item["done"] else 8)
        page.drawCentredString(55, y - 16, "OK" if item["done"] else "!")
        page.setFillColor(dark)
        page.setFont("Helvetica-Bold", 9)
        page.drawString(72, y - 8, item["title"])
        page.setFillColor(muted)
        page.setFont("Helvetica", 8)
        page.drawString(72, y - 24, item["description"])
        y -= 55

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 13)
    page.drawString(36, 105, "Rapporten om te bewaren")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(36, 87, "Download ook het btw-overzicht en de winst- en verliesrekening voor je eigen dossier of overleg met je boekhouder.")

    draw_footer(page, width)
    page.save()
    return output.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    sys.stdout.buffer.write(create_pdf(data))

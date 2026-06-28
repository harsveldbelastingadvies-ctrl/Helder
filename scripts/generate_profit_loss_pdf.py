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


def ellipsize(text, max_length):
    text = str(text)
    return text if len(text) <= max_length else text[: max_length - 3] + "..."


def draw_header(page, width, height, summary, page_number):
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

    page.setFont("Helvetica-Bold", 18)
    page.drawRightString(width - 36, height - 48, "CONCEPT WINST EN VERLIES")
    page.setFont("Helvetica", 8)
    page.setFillColor(muted)
    page.drawRightString(width - 36, height - 63, f'{summary["year"]} - pagina {page_number}')


def draw_footer(page, width, page_number):
    muted = HexColor("#939C98")
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawString(36, 24, "Conceptoverzicht. Controleer dit met je boekhouder of adviseur.")
    page.drawRightString(width - 36, 24, f"Pagina {page_number}")


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
    page.drawString(x + 15, y + h - 47, amount)
    page.setFillColor(subtitle_color)
    page.setFont("Helvetica", 7)
    page.drawString(x + 15, y + 15, subtitle)


def draw_table_header(page, y, width):
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")
    page.setFillColor(muted)
    page.setFont("Helvetica-Bold", 7)
    page.drawString(36, y, "INVESTERING")
    page.drawString(198, y, "AANSCHAF")
    page.drawRightString(297, y, "BEDRAG EXCL. BTW")
    page.drawRightString(393, y, "LOOPTIJD")
    page.drawRightString(495, y, "DIT JAAR")
    page.drawRightString(width - 36, y, "NOG TE GAAN")
    page.setStrokeColor(line)
    page.line(36, y - 8, width - 36, y - 8)


def draw_depreciation_row(page, row, y, width):
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(36, y, ellipsize(row["supplier"], 24))
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawString(36, y - 12, ellipsize(row["description"], 36))
    page.setFillColor(dark)
    page.setFont("Helvetica", 8)
    page.drawString(198, y, str(row["purchaseYear"]))
    page.drawRightString(297, y, money(row["purchaseAmountExclCents"]))
    page.drawRightString(393, y, f'{row["depreciationYears"]} jaar')
    page.setFont("Helvetica-Bold", 8)
    page.drawRightString(495, y, money(row["currentYearDepreciationCents"]))
    page.setFont("Helvetica", 8)
    page.drawRightString(width - 36, y, f'{row["remainingYears"]} jaar')
    page.setStrokeColor(line)
    page.line(36, y - 22, width - 36, y - 22)


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

    page_number = 1
    draw_header(page, width, height, summary, page_number)

    profit = summary["profitCents"]
    result_label = "winst" if profit >= 0 else "verlies"

    page.setFillColor(pale)
    page.roundRect(36, height - 122, width - 72, 36, 7, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(50, height - 101, "LET OP")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(92, height - 101, "Dit is een concept. Btw-bedragen staan niet in deze winst- en verliesrekening.")
    page.drawRightString(width - 50, height - 101, f"Gemaakt op {today_nl()}")

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(36, height - 158, "Antwoord in het kort")
    page.setFillColor(muted)
    page.setFont("Helvetica", 9)
    page.drawString(36, height - 178, f'Voor {summary["year"]} toont Helder je omzet, kosten, afschrijvingen en resultaat.')

    page.setFillColor(green_dark if profit >= 0 else HexColor("#9A4C43"))
    page.roundRect(36, height - 288, width - 72, 82, 10, fill=1, stroke=0)
    page.setFillColor(HexColor("#C1D4CD") if profit >= 0 else HexColor("#F6D7D1"))
    page.setFont("Helvetica-Bold", 9)
    page.drawString(58, height - 232, f"RESULTAAT {summary['year']}".upper())
    page.setFillColor(HexColor("#FFFFFF"))
    page.setFont("Helvetica-Bold", 28)
    page.drawString(58, height - 264, f"{money(abs(profit))} {result_label}")
    page.setFillColor(HexColor("#C1D4CD") if profit >= 0 else HexColor("#F6D7D1"))
    page.setFont("Helvetica", 8)
    page.drawRightString(width - 58, height - 252, "Omzet min gewone kosten en afschrijvingen.")

    card_y = height - 388
    card_w = (width - 92) / 3
    draw_card(page, 36, card_y, card_w, 64, "Omzet zonder btw", money(summary["revenueCents"]), "Verstuurde en betaalde facturen")
    draw_card(page, 46 + card_w, card_y, card_w, 64, "Gewone kosten", money(summary["regularExpensesCents"]), "Directe kosten zonder btw")
    draw_card(page, 56 + card_w * 2, card_y, card_w, 64, "Afschrijvingen", money(summary["depreciationCents"]), "Jaarbedrag investeringen", True)

    page.setFillColor(HexColor("#FFFFFF"))
    page.setStrokeColor(line)
    page.roundRect(36, height - 525, width - 72, 96, 9, fill=1, stroke=1)
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 12)
    page.drawString(56, height - 456, "Hoe leest Helder afschrijvingen?")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(56, height - 477, "1. Gewone kosten tellen direct mee in dit jaar.")
    page.drawString(56, height - 494, "2. Investeringen worden verdeeld over 5 of 10 jaar.")
    page.drawString(56, height - 511, "3. Alleen het jaarbedrag komt in de winst- en verliesrekening.")

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 13)
    page.drawString(36, height - 570, "Opbouw resultaat")
    y = height - 600
    rows = [
        ("Omzet zonder btw", summary["revenueCents"]),
        ("Gewone kosten", -summary["regularExpensesCents"]),
        ("Afschrijvingen", -summary["depreciationCents"]),
        ("Resultaat", summary["profitCents"]),
    ]
    for label, value in rows:
        page.setFillColor(dark if label == "Resultaat" else muted)
        page.setFont("Helvetica-Bold" if label == "Resultaat" else "Helvetica", 9)
        page.drawString(52, y, label)
        page.drawRightString(width - 52, y, money(value))
        page.setStrokeColor(line)
        page.line(52, y - 9, width - 52, y - 9)
        y -= 26

    draw_footer(page, width, page_number)
    page.showPage()

    page_number += 1
    draw_header(page, width, height, summary, page_number)
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(36, height - 96, "Afschrijvingen")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawRightString(width - 36, height - 96, f'Nieuwe investeringen dit jaar: {money(summary["investmentPurchasesCents"])}')

    depreciation_rows = summary["depreciationRows"]
    if not depreciation_rows:
        page.setFillColor(pale)
        page.roundRect(36, height - 170, width - 72, 52, 8, fill=1, stroke=0)
        page.setFillColor(dark)
        page.setFont("Helvetica-Bold", 10)
        page.drawString(56, height - 142, "Nog geen investeringen met afschrijving ingevoerd.")
    else:
        y = height - 134
        draw_table_header(page, y, width)
        y -= 30
        for row in depreciation_rows:
            if y < 72:
                draw_footer(page, width, page_number)
                page.showPage()
                page_number += 1
                draw_header(page, width, height, summary, page_number)
                y = height - 100
                draw_table_header(page, y, width)
                y -= 30
            draw_depreciation_row(page, row, y, width)
            y -= 34

    draw_footer(page, width, page_number)
    page.save()
    return output.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    sys.stdout.buffer.write(create_pdf(data))

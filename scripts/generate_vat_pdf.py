import io
import json
import sys
from datetime import date

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas


def money(cents):
    value = cents / 100
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"EUR {formatted}"


def date_nl(value):
    year, month, day = value.split("-")
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    return f"{int(day)} {months[int(month) - 1]} {year}"


def today_nl():
    return date_nl(date.today().isoformat())


def ellipsize(text, max_length):
    text = str(text)
    return text if len(text) <= max_length else text[: max_length - 3] + "..."


def draw_header(page, width, height, export_data, page_number):
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

    page.setFont("Helvetica-Bold", 21)
    page.drawRightString(width - 36, height - 48, "CONCEPT BTW-OVERZICHT")
    page.setFont("Helvetica", 8)
    page.setFillColor(muted)
    page.drawRightString(width - 36, height - 63, f'{export_data["period"]["label"]} - pagina {page_number}')


def draw_summary_card(page, x, y, w, h, title, amount, subtitle, dark_card=False):
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
    page.setFont("Helvetica-Bold", 18)
    page.drawString(x + 15, y + h - 47, amount)
    page.setFillColor(subtitle_color)
    page.setFont("Helvetica", 7)
    page.drawString(x + 15, y + 15, subtitle)


def draw_table_header(page, y, width):
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")

    page.setFillColor(muted)
    page.setFont("Helvetica-Bold", 7)
    page.drawString(36, y, "DATUM")
    page.drawString(105, y, "NUMMER")
    page.drawString(180, y, "NAAM EN OMSCHRIJVING")
    page.drawRightString(555, y, "BTW")
    page.drawRightString(640, y, "EXCL. BTW")
    page.drawRightString(720, y, "BTW")
    page.drawRightString(width - 36, y, "INCL. BTW")
    page.setStrokeColor(line)
    page.line(36, y - 8, width - 36, y - 8)


def draw_section_intro(page, y, title, intro, total_label, total_amount, width):
    green = HexColor("#145B4D")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    pale = HexColor("#EDF5F2")

    page.setFillColor(pale)
    page.roundRect(36, y - 32, width - 72, 44, 8, fill=1, stroke=0)
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 11)
    page.drawString(51, y - 6, title)
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(51, y - 21, intro)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 9)
    page.drawRightString(width - 51, y - 6, total_amount)
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawRightString(width - 51, y - 21, total_label)


def draw_row(page, row, y, width):
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")

    page.setFillColor(dark)
    page.setFont("Helvetica", 8)
    page.drawString(36, y, date_nl(row["date"]))
    page.drawString(105, y, ellipsize(row["document"], 15))
    page.setFont("Helvetica-Bold", 8)
    page.drawString(180, y, ellipsize(row["name"], 30))
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawString(180, y - 12, ellipsize(row["description"], 56))
    page.setFillColor(dark)
    page.setFont("Helvetica", 8)
    page.drawRightString(555, y, f'{row["vatRate"]}%')
    page.drawRightString(640, y, money(row["amountExclCents"]))
    page.drawRightString(720, y, money(row["vatCents"]))
    page.setFont("Helvetica-Bold", 8)
    page.drawRightString(width - 36, y, money(row["amountInclCents"]))
    page.setStrokeColor(line)
    page.line(36, y - 22, width - 36, y - 22)


def draw_footer(page, width, page_number):
    muted = HexColor("#939C98")
    page.setFillColor(muted)
    page.setFont("Helvetica", 7)
    page.drawString(36, 24, "Conceptoverzicht. Controleer dit voor je btw-aangifte.")
    page.drawRightString(width - 36, 24, f"Pagina {page_number}")


def create_pdf(export_data):
    output = io.BytesIO()
    page = canvas.Canvas(output, pagesize=landscape(A4))
    width, height = landscape(A4)

    green = HexColor("#145B4D")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    pale = HexColor("#EDF5F2")

    page_number = 1
    draw_header(page, width, height, export_data, page_number)

    summary = export_data["summary"]
    payable_is_positive = summary["payableVatCents"] >= 0
    payable_label = "Geschat te betalen" if payable_is_positive else "Geschat terug te krijgen"
    payable_text = money(abs(summary["payableVatCents"]))

    page.setFillColor(pale)
    page.roundRect(36, height - 118, width - 72, 32, 7, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(50, height - 100, "LET OP")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(94, height - 100, "Dit is een concept op basis van opgeslagen facturen en kosten. Conceptfacturen tellen niet mee.")
    page.drawRightString(width - 50, height - 100, f"Gemaakt op {today_nl()}")

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(36, height - 154, "Antwoord in het kort")
    page.setFillColor(muted)
    page.setFont("Helvetica", 9)
    page.drawString(36, height - 174, f'Voor {export_data["period"]["label"]} is dit het bedrag dat je volgens Helder waarschijnlijk moet betalen of terugkrijgt.')

    page.setFillColor(HexColor("#173E35"))
    page.roundRect(36, height - 286, width - 72, 84, 10, fill=1, stroke=0)
    page.setFillColor(HexColor("#C1D4CD"))
    page.setFont("Helvetica-Bold", 9)
    page.drawString(58, height - 229, payable_label.upper())
    page.setFillColor(HexColor("#FFFFFF"))
    page.setFont("Helvetica-Bold", 30)
    page.drawString(58, height - 263, payable_text)
    page.setFillColor(HexColor("#C1D4CD"))
    page.setFont("Helvetica", 8)
    if payable_is_positive:
        page.drawRightString(width - 58, height - 252, "Dit bedrag betaal je naar verwachting aan de Belastingdienst.")
    else:
        page.drawRightString(width - 58, height - 252, "Dit bedrag krijg je naar verwachting terug of verrekend.")

    card_y = height - 382
    card_w = (width - 92) / 3
    draw_summary_card(page, 36, card_y, card_w, 64, "Btw op verkoopfacturen", money(summary["receivedVatCents"]), "Definitieve verkoopfacturen")
    draw_summary_card(page, 46 + card_w, card_y, card_w, 64, "Betaalde btw op kosten", money(summary["paidVatCents"]), "Voorbelasting")
    draw_summary_card(page, 56 + card_w * 2, card_y, card_w, 64, payable_label, payable_text, export_data["period"]["label"], True)

    page.setFillColor(pale)
    page.roundRect(36, 92, width - 72, 116, 9, fill=1, stroke=0)
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 12)
    page.drawString(56, 178, "Hoe leest Helder dit?")
    page.setFillColor(muted)
    page.setFont("Helvetica", 9)
    page.drawString(56, 157, "1. Eerst telt Helder de btw op verkoopfacturen mee die niet meer op concept staan.")
    page.drawString(56, 138, "2. Daarna trekt Helder de btw af die je op zakelijke kosten hebt betaald.")
    page.drawString(56, 119, "3. Het verschil is je conceptbedrag voor deze periode.")
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 11)
    page.drawRightString(width - 56, 138, f'{money(summary["receivedVatCents"])} - {money(summary["paidVatCents"])} = {payable_text}')

    draw_footer(page, width, page_number)
    page.showPage()

    page_number += 1
    draw_header(page, width, height, export_data, page_number)
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(36, height - 96, "Zo komt het bedrag tot stand")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawRightString(width - 36, height - 96, f'Periode: {date_nl(export_data["period"]["start"])} t/m {date_nl(export_data["period"]["end"])}')

    sales_rows = [row for row in export_data["rows"] if row["type"] == "Verkoopfactuur"]
    purchase_rows = [row for row in export_data["rows"] if row["type"] != "Verkoopfactuur"]
    sales_total = sum(row["vatCents"] for row in sales_rows)
    purchase_total = sum(row["vatCents"] for row in purchase_rows)

    y = height - 135
    row_height = 36

    def ensure_space(current_y, needed=70):
        nonlocal page_number
        if current_y >= needed:
            return current_y
        draw_footer(page, width, page_number)
        page.showPage()
        page_number += 1
        draw_header(page, width, height, export_data, page_number)
        return height - 96

    def draw_section(title, intro, total_label, total_amount, rows, empty_text, current_y):
        nonlocal page_number
        current_y = ensure_space(current_y, 155)
        draw_section_intro(page, current_y, title, intro, total_label, money(total_amount), width)
        current_y -= 58
        draw_table_header(page, current_y, width)
        current_y -= 27

        if not rows:
            page.setFillColor(muted)
            page.setFont("Helvetica", 9)
            page.drawString(36, current_y, empty_text)
            return current_y - 38

        for row in rows:
            if current_y < 72:
                draw_footer(page, width, page_number)
                page.showPage()
                page_number += 1
                draw_header(page, width, height, export_data, page_number)
                current_y = height - 96
                draw_section_intro(page, current_y, f"{title} (vervolg)", intro, total_label, money(total_amount), width)
                current_y -= 58
                draw_table_header(page, current_y, width)
                current_y -= 27
            draw_row(page, row, current_y, width)
            current_y -= row_height
        return current_y - 16

    y = draw_section(
        "Verkoopfacturen",
        "Btw die je aan klanten hebt berekend. Conceptfacturen tellen nog niet mee.",
        "Btw te betalen uit verkoop",
        sales_total,
        sales_rows,
        "Geen verkoopfacturen in deze periode.",
        y,
    )
    y = draw_section(
        "Inkoopfacturen en kosten",
        "Btw die je zelf hebt betaald op zakelijke kosten. Dit heet voorbelasting.",
        "Btw terug te vragen uit inkoop",
        purchase_total,
        purchase_rows,
        "Geen inkoopfacturen of kosten in deze periode.",
        y,
    )

    draw_footer(page, width, page_number)
    page.save()
    return output.getvalue()


export_data = json.load(sys.stdin)
sys.stdout.buffer.write(create_pdf(export_data))

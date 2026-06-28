import io
import json
import sys
from datetime import datetime

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def money(cents):
    value = cents / 100
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"EUR {formatted}"


def date_nl(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    return f"{dt.day} {months[dt.month - 1]} {dt.year}"


def card(page, x, y, w, h, label, value, note, accent=False):
    green = HexColor("#173E35")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    line = HexColor("#E5E7E2")
    if accent:
        page.setFillColor(green)
        page.roundRect(x, y, w, h, 9, fill=1, stroke=0)
        label_color = HexColor("#CFE3DA")
        value_color = HexColor("#FFFFFF")
        note_color = HexColor("#CFE3DA")
    else:
        page.setFillColor(HexColor("#FFFFFF"))
        page.setStrokeColor(line)
        page.roundRect(x, y, w, h, 9, fill=1, stroke=1)
        label_color = muted
        value_color = dark
        note_color = muted
    page.setFillColor(label_color)
    page.setFont("Helvetica-Bold", 7)
    page.drawString(x + 14, y + h - 20, label.upper())
    page.setFillColor(value_color)
    page.setFont("Helvetica-Bold", 16)
    page.drawString(x + 14, y + h - 44, value)
    page.setFillColor(note_color)
    page.setFont("Helvetica", 7)
    page.drawString(x + 14, y + 13, note)


def create_pdf(report):
    output = io.BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    green = HexColor("#145B4D")
    dark = HexColor("#17211E")
    muted = HexColor("#68736F")
    pale = HexColor("#EDF5F2")

    page.setFillColor(green)
    page.roundRect(42, height - 78, 30, 30, 8, fill=1, stroke=0)
    page.setFillColor(HexColor("#FFFFFF"))
    page.setFont("Helvetica-BoldOblique", 20)
    page.drawCentredString(57, height - 69, "h")
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 17)
    page.drawString(82, height - 67, "helder")
    page.setFont("Helvetica-Bold", 24)
    page.drawRightString(width - 42, height - 58, "ONDERNEMERSRAPPORT")
    page.setFont("Helvetica", 9)
    page.setFillColor(muted)
    page.drawRightString(width - 42, height - 76, f'{report["companyName"]} | {report["year"]}')

    page.setFillColor(pale)
    page.roundRect(42, height - 142, width - 84, 42, 8, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 8)
    page.drawString(56, height - 118, "KORT OVERZICHT")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(150, height - 118, f'Gemaakt op {date_nl(report["createdAt"])}. Conceptoverzicht voor ondernemer en adviseur.')

    result_label = "winst" if report["profitCents"] >= 0 else "verlies"
    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 15)
    page.drawString(42, height - 178, "Belangrijkste cijfers")
    page.setFont("Helvetica", 9)
    page.setFillColor(muted)
    page.drawString(42, height - 196, "Omzet, kosten, resultaat, openstaande facturen en btw in één overzicht.")

    w = (width - 104) / 3
    card(page, 42, height - 286, w, 66, "Omzet", money(report["revenueCents"]), "zonder btw", True)
    card(page, 52 + w, height - 286, w, 66, "Resultaat", f'{money(abs(report["profitCents"]))} {result_label}', "concept winst/verlies")
    card(page, 62 + 2 * w, height - 286, w, 66, "Open facturen", money(report["openInvoicesCents"]), f'{report["openInvoicesCount"]} open')

    card(page, 42, height - 374, w, 66, "Gewone kosten", money(report["regularExpensesCents"]), "zonder btw")
    card(page, 52 + w, height - 374, w, 66, "Afschrijvingen", money(report["depreciationCents"]), "jaarbedrag")
    vat_note = "te betalen" if report["vatPayableCents"] >= 0 else "terug te krijgen"
    card(page, 62 + 2 * w, height - 374, w, 66, f'Btw {report["vatPeriod"]}', money(abs(report["vatPayableCents"])), vat_note)

    page.setFillColor(pale)
    page.roundRect(42, height - 468, width - 84, 68, 8, fill=1, stroke=0)
    page.setFillColor(green)
    page.setFont("Helvetica-Bold", 9)
    page.drawString(58, height - 426, "AANDACHTSPUNTEN")
    page.setFillColor(muted)
    page.setFont("Helvetica", 8)
    page.drawString(58, height - 445, f'Er zijn {report["overdueInvoicesCount"]} te late facturen, {report["customerCount"]} klanten en {report["expenseCount"]} kostenposten geregistreerd.')
    page.drawString(58, height - 460, "Controleer dit rapport samen met de btw-opgaaf en winst- en verliesrekening voordat je het gebruikt voor aangifte.")

    page.setFillColor(dark)
    page.setFont("Helvetica-Bold", 13)
    page.drawString(42, height - 520, "Wat betekent dit praktisch?")
    page.setFillColor(muted)
    page.setFont("Helvetica", 9)
    lines = [
        "1. Bekijk openstaande facturen en stuur zo nodig een herinnering.",
        "2. Controleer of alle zakelijke kosten en bonnetjes zijn ingevoerd.",
        "3. Zet alvast geld apart voor btw en eventuele inkomstenbelasting.",
        "4. Deel dit concept met je boekhouder of adviseur voor controle.",
    ]
    y = height - 546
    for line in lines:
        page.drawString(58, y, line)
        y -= 18

    page.setFillColor(HexColor("#939C98"))
    page.setFont("Helvetica", 7)
    page.drawCentredString(width / 2, 38, "Gemaakt met Helder - concept ondernemersrapport")
    page.save()
    return output.getvalue()


report_data = json.load(sys.stdin)
sys.stdout.buffer.write(create_pdf(report_data))

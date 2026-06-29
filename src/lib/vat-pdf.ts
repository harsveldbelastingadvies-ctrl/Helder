import "server-only";

import { euro } from "./invoice";
import type { getVatExport } from "./vat";

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const green = "0.08 0.36 0.30";
const greenDark = "0.06 0.25 0.21";
const dark = "0.09 0.13 0.12";
const muted = "0.42 0.48 0.45";
const pale = "0.93 0.96 0.95";
const paleBlue = "0.94 0.97 0.99";
const line = "0.88 0.90 0.88";

type VatExport = Awaited<ReturnType<typeof getVatExport>>;
type VatPdfRow = VatExport["rows"][number];

function sanitize(input: unknown) {
  return String(input ?? "")
    .replace(/€/g, "EUR ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function escapePdfText(input: unknown) {
  return sanitize(input).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textWidth(input: unknown, size: number) {
  return sanitize(input).length * size * 0.49;
}

function wrapText(input: unknown, maxChars: number, maxLines?: number) {
  const words = sanitize(input).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) : word;
    }
  }
  if (current) lines.push(current);
  if (!lines.length) lines.push("");

  if (maxLines && lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(0, maxChars - 3)).trim()}...`;
    return clipped;
  }
  return lines;
}

function dateNl(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function money(cents: number) {
  return euro(cents).replace("€", "EUR");
}

function totalsFor(rows: VatPdfRow[]) {
  return rows.reduce((totals, row) => ({
    excl: totals.excl + row.amountExclCents,
    vat: totals.vat + row.vatCents,
    incl: totals.incl + row.amountInclCents,
  }), { excl: 0, vat: 0, incl: 0 });
}

class VatPdfBuilder {
  private pages: string[][] = [];
  private commands: string[] = [];
  private y = pageHeight - margin;

  constructor(private title: string, private period: string) {
    this.newPage();
  }

  private push(command: string) {
    this.commands.push(command);
  }

  private newPage() {
    if (this.commands.length) this.pages.push(this.commands);
    this.commands = [];
    this.y = pageHeight - margin;
    this.text("rekenrust", margin, this.y, 15, "bold", green);
    this.text(this.title.toUpperCase(), pageWidth - margin, this.y, 18, "bold", dark, "right");
    this.text(this.period, pageWidth - margin, this.y - 18, 9, "regular", muted, "right");
    this.line(this.y - 29);
    this.y -= 62;
  }

  private ensureSpace(height: number) {
    if (this.y - height < 62) this.newPage();
  }

  private text(input: unknown, x: number, y: number, size = 9, font: "regular" | "bold" = "regular", color = dark, align: "left" | "right" | "center" = "left") {
    const safe = escapePdfText(input);
    const fontName = font === "bold" ? "F2" : "F1";
    const estimatedWidth = textWidth(input, size);
    const drawX = align === "right" ? x - estimatedWidth : align === "center" ? x - estimatedWidth / 2 : x;
    this.push(`BT /${fontName} ${size} Tf ${color} rg ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET`);
  }

  private rect(x: number, y: number, width: number, height: number, color: string) {
    this.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  private line(y: number, x1 = margin, x2 = pageWidth - margin, color = line) {
    this.push(`${color} RG 0.8 w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }

  paragraph(input: unknown, maxChars = 92) {
    const lines = wrapText(input, maxChars);
    this.ensureSpace(lines.length * 13 + 8);
    for (const wrappedLine of lines) {
      this.text(wrappedLine, margin, this.y, 9, "regular", muted);
      this.y -= 13;
    }
    this.y -= 7;
  }

  hero(label: string, amount: string, body: string) {
    this.ensureSpace(110);
    const top = this.y;
    this.rect(margin, top - 96, contentWidth, 96, greenDark);
    this.text("BELANGRIJKSTE UITKOMST", margin + 18, top - 24, 8, "bold", "0.75 0.86 0.81");
    this.text(label, margin + 18, top - 48, 18, "bold", "1 1 1");
    this.text(amount, pageWidth - margin - 18, top - 48, 23, "bold", "1 1 1", "right");
    wrapText(body, 82, 2).forEach((lineText, index) => {
      this.text(lineText, margin + 18, top - 72 - index * 11, 8.5, "regular", "0.85 0.92 0.89");
    });
    this.y -= 116;
  }

  sectionTitle(title: string, subtitle?: string) {
    this.ensureSpace(subtitle ? 46 : 30);
    this.text(title, margin, this.y, 14, "bold");
    this.y -= 17;
    if (subtitle) {
      wrapText(subtitle, 92, 2).forEach((lineText) => {
        this.text(lineText, margin, this.y, 8.5, "regular", muted);
        this.y -= 11;
      });
    }
    this.y -= 8;
  }

  summaryCards(cards: Array<{ label: string; value: string; note: string; tone?: "dark" | "blue" }>) {
    const gap = 12;
    const cardWidth = (contentWidth - gap) / 2;
    const cardHeight = 70;
    for (let index = 0; index < cards.length; index += 2) {
      this.ensureSpace(cardHeight + 14);
      const row = cards.slice(index, index + 2);
      row.forEach((card, column) => {
        const x = margin + column * (cardWidth + gap);
        const y = this.y - cardHeight;
        const background = card.tone === "dark" ? greenDark : card.tone === "blue" ? paleBlue : pale;
        const labelColor = card.tone === "dark" ? "0.76 0.86 0.81" : muted;
        const valueColor = card.tone === "dark" ? "1 1 1" : dark;
        const noteColor = card.tone === "dark" ? "0.82 0.91 0.87" : muted;
        this.rect(x, y, cardWidth, cardHeight, background);
        this.text(card.label.toUpperCase(), x + 14, this.y - 19, 7, "bold", labelColor);
        this.text(card.value, x + 14, this.y - 40, 15, "bold", valueColor);
        this.text(card.note, x + 14, this.y - 57, 7.5, "regular", noteColor);
      });
      this.y -= cardHeight + 12;
    }
    this.y -= 6;
  }

  totalsStrip(items: Array<{ label: string; value: string }>) {
    const width = contentWidth / items.length;
    this.ensureSpace(54);
    this.rect(margin, this.y - 46, contentWidth, 46, pale);
    items.forEach((item, index) => {
      const x = margin + index * width + 13;
      this.text(item.label.toUpperCase(), x, this.y - 17, 6.8, "bold", muted);
      this.text(item.value, x, this.y - 34, 10, "bold", dark);
      if (index > 0) this.line(this.y - 23, margin + index * width, margin + index * width, line);
    });
    this.y -= 62;
  }

  empty(text: string) {
    this.ensureSpace(52);
    this.rect(margin, this.y - 42, contentWidth, 42, pale);
    this.text(text, margin + 15, this.y - 25, 9, "regular", muted);
    this.y -= 58;
  }

  row(row: VatPdfRow) {
    const descriptionLines = wrapText(`${row.name} - ${row.description}`, 66, 2);
    const rowHeight = 76 + Math.max(0, descriptionLines.length - 1) * 10;
    this.ensureSpace(rowHeight + 8);

    const top = this.y;
    this.rect(margin, top - rowHeight, contentWidth, rowHeight, "0.99 0.99 0.98");
    this.text(`${dateNl(row.date)} - ${row.document}`, margin + 14, top - 18, 8, "bold", muted);
    descriptionLines.forEach((lineText, index) => {
      this.text(lineText, margin + 14, top - 38 - index * 11, 9.2, index === 0 ? "bold" : "regular", dark);
    });

    const amountX = pageWidth - margin - 14;
    this.text("Excl. btw", amountX - 170, top - 20, 6.8, "bold", muted);
    this.text(money(row.amountExclCents), amountX - 170, top - 37, 9, "bold", dark);
    this.text(`Btw ${row.vatRate}%`, amountX - 88, top - 20, 6.8, "bold", muted);
    this.text(money(row.vatCents), amountX - 88, top - 37, 9, "bold", dark);
    this.text("Incl. btw", amountX, top - 20, 6.8, "bold", muted, "right");
    this.text(money(row.amountInclCents), amountX, top - 37, 9.5, "bold", dark, "right");

    this.line(top - rowHeight, margin, pageWidth - margin);
    this.y -= rowHeight + 8;
  }

  finish() {
    if (this.commands.length) this.pages.push(this.commands);
    return renderPdf(this.pages);
  }
}

function renderPdf(pages: string[][]) {
  const objects = new Map<number, string>();
  const pageRefs: string[] = [];
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((commands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    pageRefs.push(`${pageId} 0 R`);
    const footerCommands = [
      ...commands,
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${margin} 28 Td (Gemaakt met Rekenrust - concept btw-overzicht) Tj ET`,
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${pageWidth - margin - 45} 28 Td (Pagina ${index + 1}) Tj ET`,
    ];
    const stream = footerCommands.join("\n");
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);

  const maxId = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects.get(id) ?? "<<>>"}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

export function generateVatPdf(exportData: VatExport) {
  const sales = exportData.rows.filter((row) => row.type === "Verkoopfactuur");
  const costs = exportData.rows.filter((row) => row.type === "Kosten");
  const salesTotals = totalsFor(sales);
  const costTotals = totalsFor(costs);
  const resultLabel = exportData.summary.payableVatCents >= 0 ? "Af te dragen btw" : "Terug te vragen btw";
  const resultAmount = money(Math.abs(exportData.summary.payableVatCents));

  const pdf = new VatPdfBuilder("Btw-overzicht", exportData.period.label);
  pdf.hero(
    resultLabel,
    resultAmount,
    exportData.summary.payableVatCents >= 0
      ? "Dit is het bedrag dat je volgens Rekenrust moet afdragen: btw op verkoopfacturen min btw op kosten."
      : "Je hebt volgens Rekenrust meer btw betaald op kosten dan ontvangen op verkoopfacturen.",
  );

  pdf.summaryCards([
    { label: "Btw op verkoopfacturen", value: money(exportData.summary.receivedVatCents), note: "Btw die je bij klanten rekent" },
    { label: "Btw op kosten", value: money(exportData.summary.paidVatCents), note: "Voorbelasting op zakelijke kosten" },
    { label: "Kosten exclusief btw", value: money(exportData.summary.expenseExclTotalCents), note: `${exportData.summary.expenseCount} kostenpost${exportData.summary.expenseCount === 1 ? "" : "en"}` },
    { label: resultLabel, value: resultAmount, note: exportData.period.label, tone: "dark" },
  ]);

  pdf.sectionTitle("Verkoopfacturen", "Btw die je op definitieve verkoopfacturen in rekening hebt gebracht. Conceptfacturen tellen niet mee.");
  if (sales.length) {
    pdf.totalsStrip([
      { label: "Verkoop excl.", value: money(salesTotals.excl) },
      { label: "Btw verkoop", value: money(salesTotals.vat) },
      { label: "Verkoop incl.", value: money(salesTotals.incl) },
    ]);
    sales.forEach((row) => pdf.row(row));
  } else {
    pdf.empty("Geen verkoopfacturen in deze btw-periode.");
  }

  pdf.sectionTitle("Kosten", "Btw die je hebt betaald op zakelijke kosten. Dit verlaagt meestal het bedrag dat je moet afdragen.");
  if (costs.length) {
    pdf.totalsStrip([
      { label: "Kosten excl.", value: money(costTotals.excl) },
      { label: "Btw kosten", value: money(costTotals.vat) },
      { label: "Kosten incl.", value: money(costTotals.incl) },
    ]);
    costs.forEach((row) => pdf.row(row));
  } else {
    pdf.empty("Geen kostenposten in deze btw-periode.");
  }

  return pdf.finish();
}

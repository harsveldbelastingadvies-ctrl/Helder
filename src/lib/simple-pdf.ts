import "server-only";

type PdfTable = {
  headers: string[];
  rows: string[][];
};

type PdfSection = {
  title: string;
  lines?: string[];
  facts?: Array<[string, string]>;
  table?: PdfTable;
};

type PdfDocument = {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  footer?: string;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const contentWidth = pageWidth - margin * 2;

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

function wrapText(input: unknown, maxChars: number) {
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
  return lines.length ? lines : [""];
}

class PdfBuilder {
  private pages: string[][] = [];
  private commands: string[] = [];
  private y = pageHeight - margin;

  constructor(private title: string, private footer = "Gemaakt met Rekenrust") {
    this.newPage();
  }

  private newPage() {
    if (this.commands.length) this.pages.push(this.commands);
    this.commands = [];
    this.y = pageHeight - margin;
    this.text("rekenrust", margin, this.y, 15, "bold", "0.08 0.36 0.30");
    this.text(this.title.toUpperCase(), pageWidth - margin, this.y, 17, "bold", "0.09 0.13 0.12", "right");
    this.line(this.y - 18);
    this.y -= 48;
  }

  private ensureSpace(height: number) {
    if (this.y - height < 58) this.newPage();
  }

  private text(input: unknown, x: number, y: number, size = 10, font: "regular" | "bold" = "regular", color = "0.09 0.13 0.12", align: "left" | "right" = "left") {
    const safe = escapePdfText(input);
    const fontName = font === "bold" ? "F2" : "F1";
    const estimatedWidth = safe.length * size * 0.52;
    const drawX = align === "right" ? x - estimatedWidth : x;
    this.commands.push(`BT /${fontName} ${size} Tf ${color} rg ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET`);
  }

  private line(y: number) {
    this.commands.push(`0.88 0.90 0.88 RG 0.8 w ${margin} ${y.toFixed(2)} m ${pageWidth - margin} ${y.toFixed(2)} l S`);
  }

  paragraph(input: unknown, size = 9, color = "0.42 0.48 0.45") {
    const lines = wrapText(input, size >= 10 ? 82 : 96);
    this.ensureSpace(lines.length * 13 + 8);
    for (const line of lines) {
      this.text(line, margin, this.y, size, "regular", color);
      this.y -= size + 4;
    }
    this.y -= 5;
  }

  heading(input: unknown) {
    this.ensureSpace(28);
    this.text(input, margin, this.y, 13, "bold");
    this.y -= 20;
  }

  facts(facts: Array<[string, string]>) {
    for (const [label, value] of facts) {
      this.ensureSpace(18);
      this.text(label, margin, this.y, 8, "bold", "0.42 0.48 0.45");
      this.text(value, pageWidth - margin, this.y, 10, "bold", "0.09 0.13 0.12", "right");
      this.y -= 17;
    }
    this.y -= 5;
  }

  table(table: PdfTable) {
    const columnCount = table.headers.length || 1;
    const colWidth = contentWidth / columnCount;
    this.ensureSpace(30);
    table.headers.forEach((header, index) => this.text(header.toUpperCase(), margin + index * colWidth, this.y, 7, "bold", "0.42 0.48 0.45"));
    this.y -= 12;
    this.line(this.y + 4);
    for (const row of table.rows.slice(0, 80)) {
      const wrappedCells = row.map((cell) => wrapText(cell, Math.max(12, Math.floor(colWidth / 4.8))).slice(0, 3));
      const rowHeight = Math.max(...wrappedCells.map((cell) => cell.length)) * 10 + 8;
      this.ensureSpace(rowHeight);
      wrappedCells.forEach((cellLines, index) => {
        cellLines.forEach((line, lineIndex) => this.text(line, margin + index * colWidth, this.y - lineIndex * 10, 7.5, index === 0 ? "bold" : "regular"));
      });
      this.y -= rowHeight;
      this.line(this.y + 5);
    }
    if (table.rows.length > 80) this.paragraph(`Let op: alleen de eerste 80 regels zijn opgenomen. Totaal aantal regels: ${table.rows.length}.`, 8);
    this.y -= 8;
  }

  section(section: PdfSection) {
    this.heading(section.title);
    for (const line of section.lines ?? []) this.paragraph(line);
    if (section.facts?.length) this.facts(section.facts);
    if (section.table) this.table(section.table);
  }

  finish() {
    if (this.commands.length) this.pages.push(this.commands);
    return renderPdf(this.pages, this.footer);
  }
}

function renderPdf(pages: string[][], footer: string) {
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
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${margin} 28 Td (${escapePdfText(footer)}) Tj ET`,
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${pageWidth - margin - 50} 28 Td (Pagina ${index + 1}) Tj ET`,
    ];
    const stream = footerCommands.join("\n");
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);

  const maxId = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects.get(id) ?? "<<>>"}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

export function createSimplePdf(document: PdfDocument) {
  const pdf = new PdfBuilder(document.title, document.footer);
  if (document.subtitle) pdf.paragraph(document.subtitle, 9);
  for (const section of document.sections) pdf.section(section);
  return pdf.finish();
}

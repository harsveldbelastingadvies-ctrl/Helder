import "server-only";

import { deflateSync, inflateSync } from "node:zlib";

import { calculateInvoice, euro } from "./invoice";
import type { InvoiceDetail } from "./invoice-data";

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const dark = "0.09 0.13 0.12";
const green = "0.08 0.36 0.30";
const muted = "0.41 0.45 0.44";
const pale = "0.93 0.96 0.95";
const line = "0.90 0.91 0.89";

type PdfObject = string | Buffer;

type PdfImage = {
  width: number;
  height: number;
  colorSpace: "/DeviceRGB" | "/DeviceGray";
  filter: "/DCTDecode" | "/FlateDecode";
  data: Buffer;
  smask?: Buffer;
};

type LogoRef = {
  id: number;
  width: number;
  height: number;
};

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

function money(cents: number) {
  return euro(cents).replace("€", "EUR");
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function quantity(value: number) {
  return String(value).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function wrapText(input: unknown, maxChars: number, maxLines?: number) {
  const words = sanitize(input).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) : word;
    }
  }
  if (current) lines.push(current);
  if (!lines.length) lines.push("");

  if (maxLines && lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\.+$/, "").slice(0, Math.max(0, maxChars - 3)).trim()}...`;
    return clipped;
  }
  return lines;
}

function estimateTextWidth(text: unknown, size: number) {
  return sanitize(text).length * size * 0.49;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], data: Buffer.from(match[2], "base64") };
}

function parseJpegDimensions(data: Buffer) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPng(data: Buffer, width: number, height: number, bytesPerPixel: number) {
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = data[inputOffset];
    inputOffset += 1;
    const rowStart = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = data[inputOffset + x];
      const left = x >= bytesPerPixel ? output[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[rowStart - stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? output[rowStart - stride + x - bytesPerPixel] : 0;
      let value = raw;

      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upperLeft);
      else if (filter !== 0) throw new Error("Unsupported PNG filter");

      output[rowStart + x] = value & 255;
    }
    inputOffset += stride;
  }
  return output;
}

function parsePng(data: Buffer): PdfImage | null {
  const signature = "89504e470d0a1a0a";
  if (data.subarray(0, 8).toString("hex") !== signature) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = data.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
  if (![0, 2, 4, 6].includes(colorType)) return null;

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const raw = unfilterPng(inflateSync(Buffer.concat(idat)), width, height, channels);

  if (colorType === 0) {
    return { width, height, colorSpace: "/DeviceGray", filter: "/FlateDecode", data: deflateSync(raw) };
  }

  if (colorType === 2) {
    return { width, height, colorSpace: "/DeviceRGB", filter: "/FlateDecode", data: deflateSync(raw) };
  }

  const colorChannels = colorType === 4 ? 1 : 3;
  const pixelCount = width * height;
  const image = Buffer.alloc(pixelCount * colorChannels);
  const alpha = Buffer.alloc(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    if (colorType === 4) {
      image[index] = raw[index * 2];
      alpha[index] = raw[index * 2 + 1];
    } else {
      image[index * 3] = raw[index * 4];
      image[index * 3 + 1] = raw[index * 4 + 1];
      image[index * 3 + 2] = raw[index * 4 + 2];
      alpha[index] = raw[index * 4 + 3];
    }
  }

  return {
    width,
    height,
    colorSpace: colorType === 4 ? "/DeviceGray" : "/DeviceRGB",
    filter: "/FlateDecode",
    data: deflateSync(image),
    smask: deflateSync(alpha),
  };
}

function parseLogo(dataUrl: string): PdfImage | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  try {
    if (parsed.mime === "image/jpeg") {
      const dimensions = parseJpegDimensions(parsed.data);
      if (!dimensions) return null;
      return { ...dimensions, colorSpace: "/DeviceRGB", filter: "/DCTDecode", data: parsed.data };
    }
    if (parsed.mime === "image/png") return parsePng(parsed.data);
  } catch {
    return null;
  }
  return null;
}

class InvoicePdf {
  private pages: string[][] = [];
  private commands: string[] = [];
  private y = 0;

  constructor(
    private invoice: InvoiceDetail,
    private logo: LogoRef | null,
  ) {}

  private push(command: string) {
    this.commands.push(command);
  }

  private text(input: unknown, x: number, y: number, size = 9, font: "regular" | "bold" | "italic" = "regular", color = dark, align: "left" | "right" | "center" = "left") {
    const safe = escapePdfText(input);
    const fontName = font === "bold" ? "F2" : font === "italic" ? "F3" : "F1";
    const width = estimateTextWidth(input, size);
    const drawX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    this.push(`BT /${fontName} ${size} Tf ${color} rg ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET`);
  }

  private line(x1: number, y1: number, x2: number, y2: number, color = line) {
    this.push(`${color} RG 0.8 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  private rect(x: number, y: number, width: number, height: number, color: string) {
    this.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  private drawLogo(x: number, top: number, maxWidth: number, maxHeight: number) {
    if (this.logo) {
      const scale = Math.min(maxWidth / this.logo.width, maxHeight / this.logo.height);
      const width = this.logo.width * scale;
      const height = this.logo.height * scale;
      const y = top - height;
      this.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /ImLogo Do Q`);
      return;
    }

    this.rect(x, top - 36, 34, 34, green);
    this.text("h", x + 17, top - 25, 22, "italic", "1 1 1", "center");
    this.text("helder", x + 45, top - 25, 17, "bold", dark);
  }

  private startPage() {
    if (this.commands.length) this.pages.push(this.commands);
    this.commands = [];

    if (this.invoice.status === "Concept") {
      this.push("q 0.94 0.95 0.94 rg BT /F2 68 Tf 0.819 0.574 -0.574 0.819 165 350 Tm (CONCEPT) Tj ET Q");
    }

    this.drawLogo(margin, pageHeight - margin, 125, 42);
    this.text("FACTUUR", pageWidth - margin, pageHeight - 59, 25, "bold", dark, "right");
    this.text(this.invoice.id, pageWidth - margin, pageHeight - 77, 10, "regular", muted, "right");
    this.y = pageHeight - 114;
  }

  private drawFirstPageHeader() {
    const { invoice } = this;
    this.startPage();

    this.text("VAN", margin, pageHeight - 122, 9, "bold");
    this.text("FACTUUR AAN", 305, pageHeight - 122, 9, "bold");

    this.text(invoice.company.name, margin, pageHeight - 141, 11, "bold");
    this.text(invoice.customer.name, 305, pageHeight - 141, 11, "bold");

    this.text(invoice.company.street, margin, pageHeight - 157, 9, "regular", muted);
    this.text(`${invoice.company.postalCode} ${invoice.company.city}`, margin, pageHeight - 172, 9, "regular", muted);
    this.text(invoice.company.email, margin, pageHeight - 187, 9, "regular", muted);
    this.text(`KVK ${invoice.company.kvkNumber}  |  BTW-ID ${invoice.company.vatNumber}`, margin, pageHeight - 202, 7, "regular", muted);

    let customerY = pageHeight - 157;
    if (invoice.customer.contact) {
      this.text(invoice.customer.contact, 305, customerY, 9, "regular", muted);
      customerY -= 15;
    }
    this.text(invoice.customer.street, 305, customerY, 9, "regular", muted);
    customerY -= 15;
    this.text(`${invoice.customer.postalCode} ${invoice.customer.city}`, 305, customerY, 9, "regular", muted);
    if (invoice.customer.email) this.text(invoice.customer.email, 305, customerY - 15, 8, "regular", muted);

    this.rect(margin, pageHeight - 252, pageWidth - margin * 2, 42, pale);
    this.text("FACTUURDATUM", 56, pageHeight - 226, 7, "bold", muted);
    this.text("VERVALDATUM", 220, pageHeight - 226, 7, "bold", muted);
    this.text("STATUS", 384, pageHeight - 226, 7, "bold", muted);
    this.text(longDate(invoice.issueDate), 56, pageHeight - 242, 9, "bold");
    this.text(longDate(invoice.dueDate), 220, pageHeight - 242, 9, "bold");
    this.text(invoice.status, 384, pageHeight - 242, 9, "bold");

    this.drawTableHeader(pageHeight - 292);
    this.y = pageHeight - 323;
  }

  private drawContinuationHeader() {
    this.startPage();
    this.text("Factuurregels vervolg", margin, this.y, 11, "bold");
    this.drawTableHeader(this.y - 34);
    this.y -= 65;
  }

  private drawTableHeader(y: number) {
    this.text("OMSCHRIJVING", margin, y, 7, "bold", muted);
    this.text("AANTAL", 350, y, 7, "bold", muted, "right");
    this.text("PRIJS", 440, y, 7, "bold", muted, "right");
    this.text("BEDRAG", pageWidth - margin, y, 7, "bold", muted, "right");
    this.line(margin, y - 9, pageWidth - margin, y - 9);
  }

  private ensureRowSpace(height: number) {
    if (this.y - height < 120) this.drawContinuationHeader();
  }

  private drawLines() {
    for (const item of this.invoice.lines) {
      const lineTotal = Math.round(item.quantity * item.unitPriceCents);
      const description = wrapText(item.description, 56, 5);
      const rowHeight = Math.max(48, 34 + (description.length - 1) * 11);
      this.ensureRowSpace(rowHeight);

      description.forEach((descriptionLine, index) => {
        this.text(descriptionLine, margin, this.y - index * 11, 9, "bold");
      });

      const vatY = this.y - description.length * 11 - 2;
      this.text(`${item.vatRate}% btw`, margin, vatY, 8, "regular", muted);
      this.text(quantity(item.quantity), 350, this.y, 9, "regular", dark, "right");
      this.text(money(item.unitPriceCents), 440, this.y, 9, "regular", dark, "right");
      this.text(money(lineTotal), pageWidth - margin, this.y, 9, "bold", dark, "right");

      this.line(margin, this.y - rowHeight + 12, pageWidth - margin, this.y - rowHeight + 12);
      this.y -= rowHeight;
    }
  }

  private drawTotalsAndPayment() {
    const totals = calculateInvoice(this.invoice.lines);
    if (this.y < 260) {
      this.startPage();
      this.text("Totaal en betaling", margin, this.y, 12, "bold");
      this.y -= 36;
    }

    let totalsY = Math.max(this.y - 5, 235);
    const left = 355;

    this.text("Subtotaal", left, totalsY, 9, "regular", muted);
    this.text(money(totals.subtotalCents), pageWidth - margin, totalsY, 9, "regular", dark, "right");
    totalsY -= 22;

    for (const [rate, vat] of Object.entries(totals.vatByRate).filter(([, amount]) => amount > 0)) {
      this.text(`Btw ${rate}%`, left, totalsY, 9, "regular", muted);
      this.text(money(vat), pageWidth - margin, totalsY, 9, "regular", dark, "right");
      totalsY -= 22;
    }

    this.line(left, totalsY + 7, pageWidth - margin, totalsY + 7, dark);
    this.text("Totaal", left, totalsY - 10, 12, "bold");
    this.text(money(totals.totalCents), pageWidth - margin, totalsY - 10, 12, "bold", dark, "right");

    this.rect(margin, 62, pageWidth - margin * 2, 75, pale);
    this.text("BETALING", 56, 114, 9, "bold", green);
    this.text(`Maak ${money(totals.totalCents)} over naar ${this.invoice.company.iban} voor ${longDate(this.invoice.dueDate)} o.v.v. ${this.invoice.id}.`, 56, 96, 8, "regular", muted);

    const footerLines = wrapText(this.invoice.company.invoiceFooter, 105, 3);
    footerLines.forEach((footerLine, index) => {
      if (footerLine) this.text(footerLine, 56, 81 - index * 10, 8, "regular", muted);
    });
  }

  render() {
    this.drawFirstPageHeader();
    this.drawLines();
    this.drawTotalsAndPayment();
    if (this.commands.length) this.pages.push(this.commands);
    return this.pages;
  }
}

function streamObject(dictionary: string, data: Buffer | string) {
  const buffer = typeof data === "string" ? Buffer.from(data, "binary") : data;
  const dictionaryWithLength = dictionary.replace(">>", `/Length ${buffer.length} >>`);
  return Buffer.concat([
    Buffer.from(`${dictionaryWithLength}\nstream\n`, "binary"),
    buffer,
    Buffer.from("\nendstream", "binary"),
  ]);
}

function renderPdf(pages: string[][], logoImage: PdfImage | null) {
  const objects = new Map<number, PdfObject>();
  const pageRefs: string[] = [];

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  objects.set(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>");

  let nextId = 6;
  let logoRef: LogoRef | null = null;
  if (logoImage) {
    let smaskRef = "";
    if (logoImage.smask) {
      const smaskId = nextId;
      nextId += 1;
      objects.set(smaskId, streamObject(`<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`, logoImage.smask));
      smaskRef = `/SMask ${smaskId} 0 R `;
    }

    const imageId = nextId;
    nextId += 1;
    objects.set(imageId, streamObject(`<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace ${logoImage.colorSpace} /BitsPerComponent 8 /Filter ${logoImage.filter} ${smaskRef}>>`, logoImage.data));
    logoRef = { id: imageId, width: logoImage.width, height: logoImage.height };
  }

  pages.forEach((commands, index) => {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageRefs.push(`${pageId} 0 R`);

    const footer = [
      ...commands,
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${pageWidth / 2 - 105} 38 Td (Gemaakt met Helder - administratie zonder omwegen) Tj ET`,
      `BT /F1 7 Tf 0.58 0.62 0.60 rg ${pageWidth - margin - 45} 38 Td (Pagina ${index + 1}) Tj ET`,
    ];
    const stream = footer.join("\n");
    const xObject = logoRef ? `/XObject << /ImLogo ${logoRef.id} 0 R >>` : "";

    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> ${xObject} >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, streamObject("<< >>", stream));
  });

  objects.set(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);

  const maxId = Math.max(...objects.keys());
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "binary")];
  const offsets = [0];

  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const object = objects.get(id) ?? "<<>>";
    chunks.push(Buffer.from(`${id} 0 obj\n`, "binary"));
    chunks.push(typeof object === "string" ? Buffer.from(object, "binary") : object);
    chunks.push(Buffer.from("\nendobj\n", "binary"));
  }

  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`, "binary"));
  for (let id = 1; id <= maxId; id += 1) {
    chunks.push(Buffer.from(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`, "binary"));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "binary"));

  return Buffer.concat(chunks);
}

export function generateInvoicePdf(invoice: InvoiceDetail) {
  const logoImage = invoice.company.invoiceLogo ? parseLogo(invoice.company.invoiceLogo) : null;
  const logoRef = logoImage ? { id: -1, width: logoImage.width, height: logoImage.height } : null;
  const pages = new InvoicePdf(invoice, logoRef).render();
  return renderPdf(pages, logoImage);
}

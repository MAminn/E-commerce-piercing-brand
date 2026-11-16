import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, type Writable } from "node:stream";
import { ZipArchive } from "archiver";

/**
 * MINIMAL STREAMING XLSX (SpreadsheetML) WRITER.
 *
 * Just enough of the Office Open XML format for a data export: several
 * sheets, a bold frozen header row with an autofilter, column widths, and
 * typed cells (text, integer, money, decimal, date-time). No dependency
 * beyond `archiver`, which the app already ships.
 *
 * Rows are appended to one temporary XML file per sheet as they are produced,
 * so memory stays flat however many orders there are; the files are zipped
 * into the .xlsx only when every sheet is complete.
 *
 * SAFETY
 *   • Every string is written as an inline string cell (`t="inlineStr"`).
 *     Excel, LibreOffice and Google Sheets never evaluate those as formulas.
 *   • As defence in depth for a cell being edited or the sheet re-saved as
 *     CSV, text that starts like a formula (= @ tab CR, or + / - followed by
 *     something that is not a number or phone number) is prefixed with an
 *     apostrophe, and the cell carries Excel's own "quote prefix" flag.
 *   • Characters XML 1.0 cannot carry are dropped; text longer than Excel's
 *     32,767-character cell limit is truncated.
 */

export type CellValue = string | number | boolean | Date | null | undefined;

export type ColumnKind = "text" | "integer" | "money" | "decimal" | "datetime";

export type ColumnSpec = {
  header: string;
  kind: ColumnKind;
  /** Approximate width in characters. */
  width?: number;
};

export type SheetSpec = {
  name: string;
  columns: readonly ColumnSpec[];
};

/** Style indexes into styles.xml `cellXfs` below. */
const STYLE = {
  default: 0,
  header: 1,
  datetime: 2,
  money: 3,
  integer: 4,
  decimal: 5,
  quotedText: 6,
} as const;

const EXCEL_MAX_CELL_CHARS = 32_767;

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping characters XML 1.0 forbids is the point
const INVALID_XML_CHARS = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Formula-injection guard. Returns the text to store and whether the cell
 * should carry the quote-prefix flag. Plain numbers and phone numbers such
 * as "+20 100 123 4567" or "-5" are left untouched (they cannot run anything);
 * anything else that a spreadsheet could read as a formula gets a leading
 * apostrophe.
 */
export function neutralizeFormula(text: string): { text: string; quotePrefix: boolean } {
  const first = text.charAt(0);
  if (first === "=" || first === "@" || first === "\t" || first === "\r") {
    return { text: `'${text}`, quotePrefix: true };
  }
  if (first === "+" || first === "-") {
    if (/^[+-][\d\s().\-/]*$/.test(text)) return { text, quotePrefix: true };
    return { text: `'${text}`, quotePrefix: true };
  }
  return { text, quotePrefix: false };
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const EXCEL_EPOCH_OFFSET_DAYS = 25_569; // 1970-01-01 as an Excel (1900 system) serial
const MS_PER_DAY = 86_400_000;

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * An instant as an Excel date serial for the wall-clock time in `timeZone`.
 * Excel cells carry no time zone, so the export states which zone it uses.
 */
export function excelSerial(date: Date, timeZone: string): number {
  let fmt = wallClockFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wallClockFormatters.set(timeZone, fmt);
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const wallClockUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    date.getUTCMilliseconds(),
  );
  return wallClockUtc / MS_PER_DAY + EXCEL_EPOCH_OFFSET_DAYS;
}

function stringCell(ref: string, raw: string, styleOverride?: number): string {
  let text = raw;
  if (text.length > EXCEL_MAX_CELL_CHARS) text = `${text.slice(0, EXCEL_MAX_CELL_CHARS - 1)}…`;
  const safe = neutralizeFormula(text);
  const style = safe.quotePrefix ? STYLE.quotedText : (styleOverride ?? STYLE.default);
  const s = style === STYLE.default ? "" : ` s="${style}"`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(safe.text)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style: number): string {
  if (!Number.isFinite(value)) return "";
  const s = style === STYLE.default ? "" : ` s="${style}"`;
  return `<c r="${ref}"${s}><v>${value}</v></c>`;
}

function renderCell(ref: string, kind: ColumnKind, value: CellValue, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return numberCell(ref, excelSerial(value, timeZone), STYLE.datetime);
  }
  if (typeof value === "boolean") return stringCell(ref, value ? "Yes" : "No");
  if (typeof value === "number") {
    switch (kind) {
      case "money":
        return numberCell(ref, value, STYLE.money);
      case "integer":
        return numberCell(ref, value, STYLE.integer);
      case "decimal":
        return numberCell(ref, value, STYLE.decimal);
      default:
        return numberCell(ref, value, STYLE.default);
    }
  }
  return stringCell(ref, value);
}

class SheetWriter {
  rowCount = 0; // data rows, header excluded
  private readonly stream: WriteStream;
  private readonly lastColumn: string;

  constructor(
    readonly spec: SheetSpec,
    readonly filePath: string,
    private readonly timeZone: string,
  ) {
    this.stream = createWriteStream(filePath, { encoding: "utf8" });
    this.lastColumn = columnLetter(spec.columns.length - 1);
    const cols = spec.columns
      .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
      .join("");
    const header = spec.columns
      .map((c, i) => stringCell(`${columnLetter(i)}1`, c.header, STYLE.header))
      .join("");
    this.stream.write(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        `<cols>${cols}</cols>` +
        `<sheetData><row r="1">${header}</row>`,
    );
  }

  /** Appends rows, waiting for the file to drain when its buffer is full. */
  async writeRows(rows: readonly (readonly CellValue[])[]): Promise<void> {
    if (rows.length === 0) return;
    let chunk = "";
    for (const row of rows) {
      const r = this.rowCount + 2;
      let cells = "";
      for (let i = 0; i < this.spec.columns.length; i++) {
        const column = this.spec.columns[i]!;
        cells += renderCell(`${columnLetter(i)}${r}`, column.kind, row[i], this.timeZone);
      }
      chunk += `<row r="${r}">${cells}</row>`;
      this.rowCount++;
    }
    if (!this.stream.write(chunk)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          this.stream.off("error", onError);
          resolve();
        };
        const onError = (err: Error) => {
          this.stream.off("drain", onDrain);
          reject(err);
        };
        this.stream.once("drain", onDrain);
        this.stream.once("error", onError);
      });
    }
  }

  /** The range the autofilter covers (header plus every data row). */
  get filterRange(): string {
    return `A1:${this.lastColumn}${this.rowCount + 1}`;
  }

  async close(): Promise<void> {
    if (this.stream.closed || this.stream.writableFinished) return;
    const tail = `</sheetData><autoFilter ref="${this.filterRange}"/></worksheet>`;
    await new Promise<void>((resolve, reject) => {
      this.stream.once("error", reject);
      this.stream.end(tail, () => resolve());
    });
  }

  destroy(): void {
    this.stream.destroy();
  }
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFEFECE7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="7">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function assertSheetName(name: string): void {
  if (name.length === 0 || name.length > 31 || /[[\]:*?/\\]/.test(name)) {
    throw new Error(`Invalid worksheet name: ${name}`);
  }
}

export class XlsxWorkbookWriter {
  private disposed = false;

  private constructor(
    private readonly dir: string,
    private readonly sheets: SheetWriter[],
    private readonly meta: { title: string; createdAt: Date },
  ) {}

  /**
   * Opens one temporary file per sheet, in workbook order. Always call
   * `dispose()` (in a finally) to remove the temporary directory.
   */
  static async create(opts: {
    sheets: readonly SheetSpec[];
    timeZone: string;
    title: string;
    createdAt?: Date;
  }): Promise<XlsxWorkbookWriter> {
    for (const s of opts.sheets) assertSheetName(s.name);
    const dir = await mkdtemp(path.join(tmpdir(), "xlsx-export-"));
    const writers = opts.sheets.map(
      (spec, i) => new SheetWriter(spec, path.join(dir, `sheet${i + 1}.xml`), opts.timeZone),
    );
    return new XlsxWorkbookWriter(dir, writers, {
      title: opts.title,
      createdAt: opts.createdAt ?? new Date(),
    });
  }

  sheet(name: string): SheetWriter {
    const found = this.sheets.find((s) => s.spec.name === name);
    if (!found) throw new Error(`Unknown worksheet: ${name}`);
    return found;
  }

  /** Completes every sheet file. Must be awaited before `createArchive()`. */
  async close(): Promise<void> {
    for (const s of this.sheets) await s.close();
  }

  private workbookXml(): string {
    const sheets = this.sheets
      .map((s, i) => `<sheet name="${escapeXml(s.spec.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("");
    const filters = this.sheets
      .map((s, i) => {
        const [from, to] = s.filterRange.split(":");
        const abs = (ref: string | undefined) => (ref ?? "").replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2");
        const quoted = `'${s.spec.name.replace(/'/g, "''")}'`;
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(`${quoted}!${abs(from)}:${abs(to)}`)}</definedName>`;
      })
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView/></bookViews><sheets>${sheets}</sheets><definedNames>${filters}</definedNames></workbook>`
    );
  }

  private workbookRelsXml(): string {
    const rels = this.sheets
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}` +
      `<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
    );
  }

  private contentTypesXml(): string {
    const sheets = this.sheets
      .map(
        (_s, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `${sheets}` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`
    );
  }

  private coreXml(): string {
    const created = this.meta.createdAt.toISOString().replace(/\.\d{3}Z$/, "Z");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(this.meta.title)}</dc:title>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
      `</cp:coreProperties>`
    );
  }

  /**
   * The finished .xlsx as a readable stream. Call after `close()`; the
   * archive reads the sheet files lazily, so do not `dispose()` until the
   * stream has ended or been abandoned.
   */
  createArchive(): ZipArchive {
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.append(this.contentTypesXml(), { name: "[Content_Types].xml" });
    archive.append(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
      { name: "_rels/.rels" },
    );
    archive.append(this.coreXml(), { name: "docProps/core.xml" });
    archive.append(this.workbookXml(), { name: "xl/workbook.xml" });
    archive.append(this.workbookRelsXml(), { name: "xl/_rels/workbook.xml.rels" });
    archive.append(STYLES_XML, { name: "xl/styles.xml" });
    this.sheets.forEach((s, i) => {
      archive.append(createReadStream(s.filePath), { name: `xl/worksheets/sheet${i + 1}.xml` });
    });
    void archive.finalize().catch(() => {
      // Surfaced through the stream's own "error" event.
    });
    return archive;
  }

  /** Convenience for tests and small exports: the whole file in memory. */
  async toBuffer(): Promise<Buffer> {
    await this.close();
    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on("data", (c: Buffer) => chunks.push(c));
    await pipeTo(this.createArchive(), sink);
    return Buffer.concat(chunks);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sheets) s.destroy();
    await rm(this.dir, { recursive: true, force: true });
  }
}

function pipeTo(source: ZipArchive, sink: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    source.on("error", reject);
    sink.on("error", reject);
    sink.on("finish", () => resolve());
    source.pipe(sink);
  });
}

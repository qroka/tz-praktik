// Минимальный генератор .xlsx без зависимостей: zip (deflate) + SpreadsheetML.
// Умеет: несколько листов, строка заголовка (жирная, с заливкой, закреплена), автофильтр, ширина колонок,
// числа, даты и текст. Текст пишется как строка (inlineStr), поэтому «=ФОРМУЛА» в ячейке не выполняется.
import { deflateRawSync } from 'node:zlib';

export type Cell = string | number | Date | null | undefined;
export type Sheet = { name: string; header: string[]; rows: Cell[][] };

// ---------- zip ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // Дата и время в формате DOS: фиксированные, чтобы одинаковые данные давали одинаковый файл.
  const dosTime = 0;
  const dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия
    local.writeUInt16LE(0x0800, 6); // имена в UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---------- SpreadsheetML ----------
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Экранирование и удаление символов, недопустимых в XML 1.0. */
const esc = (text: string): string =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const MSK_OFFSET_MS = 3 * 3_600_000;
/** Дата Excel (дни от 1899-12-30) в московском времени: у Excel нет часовых поясов. */
const excelDate = (date: Date): number => (date.getTime() + MSK_OFFSET_MS) / 86_400_000 + 25569;

const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_WRAP = 3;

function cellXml(ref: string, value: Cell): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : `<c r="${ref}" s="${STYLE_DATE}"><v>${excelDate(value)}</v></c>`;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : '';
  const text = value.length > 32_000 ? value.slice(0, 32_000) : value;
  const style = text.includes('\n') ? ` s="${STYLE_WRAP}"` : '';
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function widthOf(value: Cell): number {
  if (value instanceof Date) return 17;
  const text = value === null || value === undefined ? '' : String(value);
  return Math.max(...text.split('\n').map((line) => line.length), 0);
}

function sheetXml(sheet: Sheet): string {
  const columns = sheet.header.length;
  const widths = sheet.header.map((title, i) => Math.min(60, Math.max(8, widthOf(title) + 3, ...sheet.rows.slice(0, 500).map((row) => widthOf(row[i]) + 2))));
  const lines: string[] = [];
  lines.push(`<row r="1">${sheet.header.map((title, i) => `<c r="${columnName(i)}1" t="inlineStr" s="${STYLE_HEADER}"><is><t>${esc(title)}</t></is></c>`).join('')}</row>`);
  sheet.rows.forEach((row, r) => {
    const cells = Array.from({ length: columns }, (_, i) => cellXml(`${columnName(i)}${r + 2}`, row[i])).join('');
    lines.push(`<row r="${r + 2}">${cells}</row>`);
  });
  const lastRef = `${columnName(Math.max(0, columns - 1))}${sheet.rows.length + 1}`;
  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastRef}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${lines.join('')}</sheetData>` +
    `<autoFilter ref="A1:${lastRef}"/>` +
    '</worksheet>'
  );
}

const STYLES_XML =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy\\ hh:mm"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA8B6"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** Имя листа: до 31 символа, без []:*?/\\. */
const sheetName = (name: string, index: number): string => name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Лист${index + 1}`;

export function buildXlsx(sheets: Sheet[]): Buffer {
  if (!sheets.length) throw new Error('Нужен хотя бы один лист.');
  const names = sheets.map((sheet, i) => sheetName(sheet.name, i));
  const files: { name: string; data: Buffer }[] = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        XML_HEAD +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        XML_HEAD +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML) },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(sheet)) })),
  ];
  return zip(files);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

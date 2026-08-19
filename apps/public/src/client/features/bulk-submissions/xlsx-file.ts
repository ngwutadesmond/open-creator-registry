import { strFromU8, unzipSync } from 'fflate';

import { resolveBulkSubmissionColumn } from '@open-creator-registry/contracts/submissions';

import { BulkFileError } from './bulk-file-types';
import { parseTabularRows } from './tabular-file';

const maximumUncompressedWorkbookSize = 32 * 1024 * 1024;
const zipEndSignature = 0x06054b50;
const zipCentralEntrySignature = 0x02014b50;
const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

type WorkbookSheet = {
  name: string;
  path: string;
  visible: boolean;
};

function hasOleSignature(bytes: Uint8Array): boolean {
  return oleSignature.every((byte, index) => bytes[index] === byte);
}

function findZipEnd(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === zipEndSignature) return offset;
  }
  return -1;
}

function inspectArchiveSafety(buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  if (hasOleSignature(bytes)) {
    throw new BulkFileError(
      'password_protected_workbook',
      'Password-protected or legacy binary workbooks are not supported.',
    );
  }
  const view = new DataView(buffer);
  const endOffset = findZipEnd(view);
  if (endOffset < 0) throw new BulkFileError('malformed_xlsx', 'The XLSX workbook is malformed.');
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset + centralSize > view.byteLength) {
    throw new BulkFileError('malformed_xlsx', 'The XLSX workbook directory is malformed.');
  }
  let offset = centralOffset;
  let uncompressedTotal = 0;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > view.byteLength ||
      view.getUint32(offset, true) !== zipCentralEntrySignature
    ) {
      throw new BulkFileError('malformed_xlsx', 'The XLSX workbook directory is malformed.');
    }
    const flags = view.getUint16(offset + 8, true);
    if ((flags & 0x1) !== 0) {
      throw new BulkFileError(
        'password_protected_workbook',
        'Password-protected workbooks are not supported.',
      );
    }
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > view.byteLength) {
      throw new BulkFileError('malformed_xlsx', 'The XLSX workbook directory is malformed.');
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    if (/vbaProject\.bin|macrosheets|xlmMacros/iu.test(name)) {
      throw new BulkFileError('macro_workbook', 'Macro-enabled workbooks are not supported.');
    }
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > maximumUncompressedWorkbookSize) {
      throw new BulkFileError(
        'expanded_workbook_too_large',
        'The workbook expands beyond the safe processing limit.',
      );
    }
    offset = nameEnd + extraLength + commentLength;
  }
}

function xmlAttributes(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of value.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gu)) {
    const name = match[1];
    const attributeValue = match[3];
    if (name && attributeValue !== undefined) attributes.set(name, attributeValue);
  }
  return attributes;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function workbookSheets(files: Record<string, Uint8Array>): WorkbookSheet[] {
  const workbook = files['xl/workbook.xml'];
  const relationships = files['xl/_rels/workbook.xml.rels'];
  if (!workbook || !relationships) {
    throw new BulkFileError('malformed_xlsx', 'The XLSX workbook metadata is incomplete.');
  }
  const relationshipPaths = new Map<string, string>();
  for (const match of strFromU8(relationships).matchAll(/<Relationship\b([^>]*)\/?\s*>/gu)) {
    const attributes = xmlAttributes(match[1] ?? '');
    const id = attributes.get('Id');
    const target = attributes.get('Target');
    if (!id || !target) continue;
    const normalizedTarget = target.replace(/^\//u, '').replace(/^xl\//u, '');
    if (normalizedTarget.includes('..')) {
      throw new BulkFileError('malformed_xlsx', 'The workbook contains an unsafe sheet path.');
    }
    relationshipPaths.set(id, `xl/${normalizedTarget}`);
  }
  const sheets: WorkbookSheet[] = [];
  for (const match of strFromU8(workbook).matchAll(/<sheet\b([^>]*)\/?\s*>/gu)) {
    const attributes = xmlAttributes(match[1] ?? '');
    const name = attributes.get('name');
    const relationshipId = attributes.get('r:id');
    const path = relationshipId ? relationshipPaths.get(relationshipId) : undefined;
    if (!name || !path) continue;
    sheets.push({
      name: decodeXml(name),
      path,
      visible: !['hidden', 'veryHidden'].includes(attributes.get('state') ?? ''),
    });
  }
  if (sheets.length === 0) {
    throw new BulkFileError('empty_workbook', 'The XLSX workbook does not contain any worksheets.');
  }
  return sheets;
}

function columnNumber(reference: string): number {
  let value = 0;
  for (const character of reference.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function headerCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return String(value);
  }
  return '';
}

function rejectRelevantFormulas(
  sheetXml: Uint8Array,
  headerRow: readonly unknown[],
  sheetName: string,
): void {
  const relevantColumns = new Set<number>();
  headerRow.forEach((value, index) => {
    if (resolveBulkSubmissionColumn(headerCellText(value))) relevantColumns.add(index + 1);
  });
  const xml = strFromU8(sheetXml);
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    if (!/<f(?:\s|>)/u.test(match[2] ?? '')) continue;
    const reference = xmlAttributes(match[1] ?? '').get('r') ?? '';
    const cell = /^([A-Z]+)(\d+)$/u.exec(reference);
    if (!cell?.[1] || !relevantColumns.has(columnNumber(cell[1]))) continue;
    throw new BulkFileError(
      'formula_cell',
      `Worksheet “${sheetName}” contains a formula in relevant cell ${reference}. Formulas are not accepted.`,
    );
  }
}

export async function parseXlsxFile(file: File) {
  const buffer = await file.arrayBuffer();
  inspectArchiveSafety(buffer);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new BulkFileError('malformed_xlsx', 'The XLSX workbook could not be opened safely.');
  }
  if (
    Object.keys(files).some((name) => /vbaProject\.bin|macrosheets|xlmMacros/iu.test(name)) ||
    strFromU8(files['[Content_Types].xml'] ?? new Uint8Array()).includes('macroEnabled')
  ) {
    throw new BulkFileError('macro_workbook', 'Macro-enabled workbooks are not supported.');
  }
  const metadata = workbookSheets(files);
  const visibleSheets = metadata.filter(({ visible }) => visible);
  if (visibleSheets.length === 0) {
    throw new BulkFileError(
      'hidden_only_workbook',
      'The workbook does not contain a visible worksheet.',
    );
  }
  const selectedSheet =
    visibleSheets.find(({ name }) => name.toLocaleLowerCase('en') === 'creators') ??
    visibleSheets[0];
  if (!selectedSheet) {
    throw new BulkFileError('empty_workbook', 'The workbook does not contain a usable worksheet.');
  }

  let parsedSheets: { sheet: string; data: unknown[][] }[];
  try {
    const { default: readXlsxFile } = await import('read-excel-file/universal');
    parsedSheets = await readXlsxFile(buffer);
  } catch {
    throw new BulkFileError(
      'malformed_xlsx',
      'The XLSX workbook is malformed or password protected.',
    );
  }
  const parsedSheet = parsedSheets.find(({ sheet }) => sheet === selectedSheet.name);
  if (!parsedSheet || parsedSheet.data.length === 0) {
    throw new BulkFileError('empty_workbook', 'The selected worksheet is empty.');
  }
  const sheetXml = files[selectedSheet.path];
  if (!sheetXml) {
    throw new BulkFileError('malformed_xlsx', 'The selected worksheet data is missing.');
  }
  rejectRelevantFormulas(sheetXml, parsedSheet.data[0] ?? [], selectedSheet.name);
  const parsed = parseTabularRows(parsedSheet.data);
  return {
    ...parsed,
    warnings: [
      ...parsed.warnings,
      ...(metadata.length > 1
        ? [
            `Used worksheet “${selectedSheet.name}”. ${metadata.length - 1} additional worksheet${metadata.length === 2 ? ' was' : 's were'} ignored.`,
          ]
        : []),
    ],
  };
}

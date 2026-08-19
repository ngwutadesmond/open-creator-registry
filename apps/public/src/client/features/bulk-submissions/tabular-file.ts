import {
  bulkSubmissionColumns,
  maximumBulkSubmissionRows,
  normalizeBulkSubmissionHeader,
  requiredBulkSubmissionColumns,
  resolveBulkSubmissionColumn,
  type BulkSubmissionColumn,
} from '@open-creator-registry/contracts/submissions';

import type { BulkSubmissionSourceRow } from '../../api/schemas';
import { BulkFileError } from './bulk-file-types';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return String(value);
  }
  throw new BulkFileError(
    'unsupported_cell_value',
    'The spreadsheet contains a cell value that cannot be treated as plain text.',
  );
}

export function splitBulkList(value: string): string[] {
  return value
    .split(/[;\r\n]+/gu)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isFormulaLike(value: string, column: BulkSubmissionColumn): boolean {
  const trimmed = value.trimStart();
  if (/^[-=+]/u.test(trimmed)) return true;
  return column !== 'requested_usernames' && trimmed.startsWith('@');
}

export function parseTabularRows(matrix: readonly (readonly unknown[])[]): {
  mapping: Partial<Record<BulkSubmissionColumn, string>>;
  rows: BulkSubmissionSourceRow[];
  warnings: string[];
} {
  if (matrix.length === 0) {
    throw new BulkFileError('empty_file', 'The spreadsheet does not contain a header row.');
  }
  const headerCells = matrix[0]?.map(cellText) ?? [];
  if (headerCells.every((value) => !value.trim())) {
    throw new BulkFileError('empty_file', 'The spreadsheet header row is empty.');
  }

  const seenRawHeaders = new Map<string, number>();
  const columnIndexes = new Map<BulkSubmissionColumn, number>();
  const mapping: Partial<Record<BulkSubmissionColumn, string>> = {};
  const ignoredHeaders: string[] = [];
  headerCells.forEach((header, index) => {
    const normalizedHeader = normalizeBulkSubmissionHeader(header);
    if (!normalizedHeader) return;
    const previousRawIndex = seenRawHeaders.get(normalizedHeader);
    if (previousRawIndex !== undefined) {
      throw new BulkFileError(
        'duplicate_header',
        `Columns ${previousRawIndex + 1} and ${index + 1} use the same header “${header.trim()}”.`,
      );
    }
    seenRawHeaders.set(normalizedHeader, index);
    const column = resolveBulkSubmissionColumn(header);
    if (!column) {
      ignoredHeaders.push(header.trim());
      return;
    }
    const previousColumnIndex = columnIndexes.get(column);
    if (previousColumnIndex !== undefined) {
      throw new BulkFileError(
        'ambiguous_header',
        `Columns ${previousColumnIndex + 1} and ${index + 1} both map to “${column}”.`,
      );
    }
    columnIndexes.set(column, index);
    mapping[column] = header.trim();
  });

  const missing = requiredBulkSubmissionColumns.filter((column) => !columnIndexes.has(column));
  if (missing.length > 0) {
    throw new BulkFileError(
      'missing_headers',
      `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
    );
  }

  const rows: BulkSubmissionSourceRow[] = [];
  matrix.slice(1).forEach((rawRow, index) => {
    const values = rawRow.map(cellText);
    if (values.every((value) => !value.trim())) return;
    const rowNumber = index + 2;
    for (const column of bulkSubmissionColumns) {
      const columnIndex = columnIndexes.get(column);
      if (columnIndex === undefined) continue;
      const value = values[columnIndex] ?? '';
      if (isFormulaLike(value, column)) {
        throw new BulkFileError(
          'formula_cell',
          `Spreadsheet row ${rowNumber}, column “${mapping[column] ?? column}” looks like a formula. Formulas are not accepted.`,
        );
      }
    }
    const valueFor = (column: BulkSubmissionColumn) => {
      const columnIndex = columnIndexes.get(column);
      return columnIndex === undefined ? '' : (values[columnIndex] ?? '');
    };
    rows.push({
      row_number: rowNumber,
      creator_name: valueFor('creator_name'),
      category: valueFor('category'),
      countries: splitBulkList(valueFor('countries')),
      requested_usernames: splitBulkList(valueFor('requested_usernames')),
      public_sources: splitBulkList(valueFor('public_sources')),
    });
  });

  if (rows.length === 0) {
    throw new BulkFileError('empty_file', 'The spreadsheet does not contain any creator rows.');
  }
  if (rows.length > maximumBulkSubmissionRows) {
    throw new BulkFileError(
      'too_many_rows',
      `The spreadsheet contains ${rows.length} creator rows. The maximum is ${maximumBulkSubmissionRows}.`,
    );
  }
  return {
    mapping,
    rows,
    warnings: ignoredHeaders.length
      ? [
          `Ignored unrelated column${ignoredHeaders.length === 1 ? '' : 's'}: ${ignoredHeaders.join(', ')}.`,
        ]
      : [],
  };
}

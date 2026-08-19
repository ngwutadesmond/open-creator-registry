import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';

import { maximumBulkSubmissionFileSize } from '@open-creator-registry/contracts/submissions';

import { BulkFileError } from './bulk-file-types';
import { createCsvTemplateText, createXlsxTemplateBlob } from './bulk-templates';
import { parseCsvFile } from './csv-file';
import { parseBulkFile } from './parse-bulk-file';
import { parseTabularRows } from './tabular-file';
import { parseXlsxFile } from './xlsx-file';

const headers = ['creator_name', 'category', 'countries', 'requested_usernames', 'public_sources'];
const exampleRow = [
  'Registry Batch Test One',
  'Music',
  'Nigeria; GH',
  'registry_batch_one; @registrybatchone',
  'https://example.test/one; https://example.org/one',
];

function csvFile(text: string, name = 'creators.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

async function xlsxFile(
  sheets: { data: unknown[][]; sheet: string }[],
  name = 'creators.xlsx',
): Promise<File> {
  const workbook = writeXlsxFile as unknown as (value: unknown[]) => {
    toBuffer(): Promise<Buffer>;
  };
  const buffer = await workbook(sheets).toBuffer();
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function rewriteWorkbook(
  file: File,
  rewrite: (files: Record<string, Uint8Array>) => void,
): Promise<File> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  rewrite(files);
  return new File([zipSync(files)], file.name, { type: file.type });
}

async function expectBulkFileError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected BulkFileError ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(BulkFileError);
    expect((error as BulkFileError).code).toBe(code);
  }
}

describe('bulk tabular parsing', () => {
  it('maps canonical and friendly headers, lists, UTF-8 names, and empty rows', () => {
    const parsed = parseTabularRows([
      ['Creator Public Name', 'Creator Category', 'Country Codes', 'Handles', 'Supporting Links'],
      [
        'Àṣẹ Registry, Studio',
        'Content Creator / Influencer',
        'Nigeria; GH',
        'name_one\n@name.two',
        'https://example.test/one; https://example.org/two',
      ],
      ['', '', '', '', ''],
    ]);

    expect(parsed.mapping).toEqual({
      creator_name: 'Creator Public Name',
      category: 'Creator Category',
      countries: 'Country Codes',
      requested_usernames: 'Handles',
      public_sources: 'Supporting Links',
    });
    expect(parsed.rows).toEqual([
      {
        row_number: 2,
        creator_name: 'Àṣẹ Registry, Studio',
        category: 'Content Creator / Influencer',
        countries: ['Nigeria', 'GH'],
        requested_usernames: ['name_one', '@name.two'],
        public_sources: ['https://example.test/one', 'https://example.org/two'],
      },
    ]);
  });

  it('rejects duplicate, ambiguous, missing, oversized, and formula-like input', () => {
    expect(() =>
      parseTabularRows([['name', 'Name', 'category', 'handles', 'public sources']]),
    ).toThrow(/same header/iu);
    expect(() =>
      parseTabularRows([
        ['creator_name', 'creator public name', 'category', 'handles', 'public sources'],
      ]),
    ).toThrow(/both map/iu);
    expect(() => parseTabularRows([['name', 'category', 'handles']])).toThrow(
      /Missing required column/iu,
    );
    expect(() => parseTabularRows([headers, ['=HYPERLINK("x")', ...exampleRow.slice(1)]])).toThrow(
      /formula/iu,
    );
    expect(() =>
      parseTabularRows([
        headers,
        ...Array.from({ length: 251 }, (_, index) => [`Registry ${index}`, ...exampleRow.slice(1)]),
      ]),
    ).toThrow(/maximum is 250/iu);
  });
});

describe('CSV bulk files', () => {
  it('parses quoted commas, quoted line breaks, semicolon lists, and UTF-8 names', async () => {
    const parsed = await parseCsvFile(
      csvFile(
        `${headers.join(',')}\r\n"Àṣẹ Registry, Studio",Music,"Nigeria; GH","name_one; name_two","https://example.test/one;\nhttps://example.org/two"\r\n`,
      ),
    );
    expect(parsed.rows[0]).toMatchObject({
      creator_name: 'Àṣẹ Registry, Studio',
      countries: ['Nigeria', 'GH'],
      requested_usernames: ['name_one', 'name_two'],
      public_sources: ['https://example.test/one', 'https://example.org/two'],
    });
  });

  it('rejects malformed, empty, and invalid-encoding CSV files', async () => {
    await expectBulkFileError(parseCsvFile(csvFile('')), 'empty_file');
    await expectBulkFileError(
      parseCsvFile(csvFile(`${headers.join(',')}\n"unterminated,Music,NG,name,url`)),
      'malformed_csv',
    );
    await expectBulkFileError(
      parseCsvFile(new File([new Uint8Array([0xc3, 0x28])], 'invalid.csv')),
      'invalid_csv_encoding',
    );
  });

  it('generates a parseable CSV template with fictional instructions', async () => {
    const template = createCsvTemplateText();
    expect(template).toContain('pending review submissions only');
    expect(template).toContain('Registry Template Example');
    expect(template).not.toContain('Wizkid');
    const parsed = await parseCsvFile(csvFile(template, 'template.csv'));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.category).toBe('content_creator');
  });
});

describe('XLSX bulk files', () => {
  it('prefers the Creators worksheet and warns when other worksheets are ignored', async () => {
    const file = await xlsxFile([
      { sheet: 'Instructions', data: [['Not creator data']] },
      { sheet: 'Creators', data: [headers, exampleRow] },
      { sheet: 'Archive', data: [headers, ['Ignored', ...exampleRow.slice(1)]] },
    ]);
    const parsed = await parseXlsxFile(file);
    expect(parsed.rows[0]?.creator_name).toBe('Registry Batch Test One');
    expect(parsed.warnings).toEqual([
      'Used worksheet “Creators”. 2 additional worksheets were ignored.',
    ]);
  });

  it('uses the first visible worksheet when Creators is absent', async () => {
    const parsed = await parseXlsxFile(
      await xlsxFile([{ sheet: 'Bulk Upload', data: [headers, exampleRow] }]),
    );
    expect(parsed.rows).toHaveLength(1);
  });

  it('rejects relevant formula cells, hidden-only sheets, and malformed workbooks', async () => {
    const formulaFile = await xlsxFile([
      {
        sheet: 'Creators',
        data: [
          headers,
          [{ type: 'Formula', value: '="Registry Formula"' }, ...exampleRow.slice(1)],
        ],
      },
    ]);
    await expectBulkFileError(parseXlsxFile(formulaFile), 'formula_cell');

    const visibleFile = await xlsxFile([{ sheet: 'Creators', data: [headers, exampleRow] }]);
    const hiddenFile = await rewriteWorkbook(visibleFile, (files) => {
      const path = 'xl/workbook.xml';
      files[path] = strToU8(
        strFromU8(files[path] ?? new Uint8Array()).replace('<sheet ', '<sheet state="hidden" '),
      );
    });
    await expectBulkFileError(parseXlsxFile(hiddenFile), 'hidden_only_workbook');
    await expectBulkFileError(
      parseXlsxFile(new File(['not a workbook'], 'broken.xlsx')),
      'malformed_xlsx',
    );
  });

  it('generates a parseable Excel template with category data validation', async () => {
    const blob = await createXlsxTemplateBlob();
    const template = new File([await blob.arrayBuffer()], 'template.xlsx', { type: blob.type });
    const files = unzipSync(new Uint8Array(await template.arrayBuffer()));
    expect(strFromU8(files['xl/worksheets/sheet1.xml'] ?? new Uint8Array())).toContain(
      '<dataValidations',
    );
    const parsed = await parseXlsxFile(template);
    expect(parsed.rows[0]).toMatchObject({
      creator_name: 'Registry Template Example',
      category: 'content_creator',
    });
    expect(parsed.warnings[0]).toContain('additional worksheet');
  });
});

describe('bulk file boundary checks', () => {
  it('accepts only bounded CSV and XLSX files', async () => {
    for (const extension of ['xls', 'xlsm', 'ods', 'txt']) {
      await expectBulkFileError(
        parseBulkFile(new File(['content'], `creators.${extension}`)),
        'unsupported_file_type',
      );
    }
    await expectBulkFileError(
      parseBulkFile(new File([new Uint8Array(maximumBulkSubmissionFileSize + 1)], 'large.csv')),
      'file_too_large',
    );
    await expectBulkFileError(parseBulkFile(new File([], 'empty.csv')), 'empty_file');
  });
});

import {
  maximumBulkSubmissionRows,
  submissionCategories,
} from '@open-creator-registry/contracts/submissions';

const templateHeaders = [
  'creator_name',
  'category',
  'countries',
  'requested_usernames',
  'public_sources',
] as const;

const fictionalExample = [
  'Registry Template Example',
  'content_creator',
  'NG; GH',
  'registry_template_example',
  'https://example.test/registry-template-example; https://example.org/registry-template-example',
] as const;

function protectSpreadsheetCell(value: string): string {
  return /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function encodeCsvCell(value: string): string {
  const protectedValue = protectSpreadsheetCell(value);
  return /[",\r\n]/u.test(protectedValue)
    ? `"${protectedValue.replaceAll('"', '""')}"`
    : protectedValue;
}

function encodeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(encodeCsvCell).join(',')).join('\r\n');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createCsvTemplateText(): string {
  const instructions = [
    '# Open Creator Registry bulk submission template',
    '# Delete the fictional example before adding creators. Valid rows become pending review submissions only.',
    '# Separate multiple countries, usernames, and sources with semicolons or line breaks. Do not include private information.',
    `# Category values: ${submissionCategories.map(({ value }) => value).join('; ')}`,
  ];
  return `${instructions.join('\r\n')}\r\n${encodeCsv([templateHeaders, fictionalExample])}\r\n`;
}

export function downloadCsvTemplate(): void {
  downloadBlob(
    new Blob([createCsvTemplateText()], { type: 'text/csv;charset=utf-8' }),
    'creator-submissions-template.csv',
  );
}

export async function createXlsxTemplateBlob(): Promise<Blob> {
  const [{ default: writeXlsxFile }, { default: dataValidation }] = await Promise.all([
    import('write-excel-file/browser'),
    import('@onparallel/write-excel-file-data-validation'),
  ]);
  const creatorData = [
    templateHeaders.map((value) => ({ value, fontWeight: 'bold' as const })),
    fictionalExample.map((value) => ({ value })),
  ];
  const instructionData = [
    [{ value: 'Open Creator Registry bulk submission template', fontWeight: 'bold' as const }],
    [
      {
        value:
          'Valid rows create pending public submissions for administrator review. They do not approve creators or reserve usernames.',
        wrap: true,
      },
    ],
    [
      {
        value:
          'Do not include identity documents, passwords, private addresses, phone numbers, contracts, or confidential claim evidence.',
        wrap: true,
      },
    ],
    [{ value: 'creator_name: required; use the best-known public name.' }],
    [{ value: 'category: required; use a stable value from the reference below.' }],
    [{ value: 'countries: optional; use country names or ISO alpha-2 codes.' }],
    [{ value: 'requested_usernames: required; separate multiple values with semicolons.' }],
    [{ value: 'public_sources: required HTTP/HTTPS URLs; separate with semicolons.' }],
    [{ value: `Maximum creator rows: ${maximumBulkSubmissionRows}.` }],
    [{ value: 'Category value' }, { value: 'Display label' }],
    ...submissionCategories.map(({ value, label }) => [{ value }, { value: label }]),
  ];
  const sheets = [
    {
      data: creatorData,
      sheet: 'Creators',
      columns: [{ width: 30 }, { width: 32 }, { width: 26 }, { width: 34 }, { width: 72 }],
      dataValidation: [
        {
          cellRange: {
            from: { row: 2, column: 2 },
            to: { row: maximumBulkSubmissionRows + 1, column: 2 },
          },
          validation: {
            type: 'list',
            values: submissionCategories.map(({ value }) => value),
            errorTitle: 'Unsupported category',
            error: 'Choose a category from the list.',
            inputTitle: 'Creator category',
            input: 'Choose a stable Registry category value.',
          },
        },
      ],
    },
    {
      data: instructionData,
      sheet: 'Instructions',
      columns: [{ width: 94 }, { width: 36 }],
    },
  ];
  const writeWorkbook = writeXlsxFile as unknown as (
    value: unknown[],
    options: { features: unknown[] },
  ) => { toBlob(): Promise<Blob> };
  return writeWorkbook(sheets, { features: [dataValidation] }).toBlob();
}

export async function downloadXlsxTemplate(): Promise<void> {
  downloadBlob(await createXlsxTemplateBlob(), 'creator-submissions-template.xlsx');
}

export function downloadBulkCsvReport(
  fileName: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  const csv = `${encodeCsv([headers, ...rows])}\r\n`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
}

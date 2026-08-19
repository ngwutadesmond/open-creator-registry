import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import writeXlsxFile from 'write-excel-file/node';

const fixtureDirectory = path.resolve('e2e/fixtures/bulk-submissions');
const headers = ['creator_name', 'category', 'countries', 'requested_usernames', 'public_sources'];
const records = [
  [
    'Registry Batch Test One',
    'music',
    'NG; GH',
    'registry_batch_test_one; @registrybatchone',
    'https://example.test/registry-batch-one',
  ],
  [
    'Registry Batch Test Two',
    'content_creator',
    'United States',
    'registry_batch_test_two',
    'https://example.test/registry-batch-two',
  ],
  [
    'Registry Batch Test Three',
    'technology',
    'GB',
    'registry_batch_test_three',
    'https://example.test/registry-batch-three',
  ],
  [
    'Registry Batch Test Four',
    'visual_arts_design',
    'Ghana',
    'registry_batch_test_four',
    'https://example.test/registry-batch-four',
  ],
  [
    'Registry Batch Test Five',
    'education',
    '',
    'registry_batch_test_five',
    'https://example.test/registry-batch-five',
  ],
];

/** @param {string} value */
function csvCell(value) {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** @param {string[][]} rows */
function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

await mkdir(fixtureDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(fixtureDirectory, 'valid-creators.csv'), csv([headers, ...records])),
  writeFile(
    path.join(fixtureDirectory, 'mixed-invalid-creators.csv'),
    csv([
      headers,
      records[0],
      records[0],
      [
        'Registry Invalid Category',
        'not_a_category',
        'NG',
        'registry_invalid_category',
        'https://example.test/invalid-category',
      ],
      [
        'Registry Invalid Country',
        'music',
        'ZZ',
        'registry_invalid_country',
        'https://example.test/invalid-country',
      ],
      [
        'Registry Invalid Source',
        'music',
        'NG',
        'registry_invalid_source',
        'file:///private/source',
      ],
    ]),
  ),
  writeXlsxFile(
    [
      { sheet: 'Creators', data: [headers, ...records] },
      {
        sheet: 'Instructions',
        data: [
          ['Fictional public-submission test fixture.'],
          ['Accepted rows create pending review submissions only.'],
        ],
      },
    ],
    {},
  ).toFile(path.join(fixtureDirectory, 'valid-creators.xlsx')),
  writeXlsxFile(
    [
      headers,
      [
        { type: 'Formula', value: '="Registry Formula Test"' },
        'music',
        'NG',
        'registry_formula_test',
        'https://example.test/registry-formula-test',
      ],
    ],
    { sheet: 'Creators' },
  ).toFile(path.join(fixtureDirectory, 'formula-creators.xlsx')),
]);

console.log(`Generated deterministic fictional bulk fixtures in ${fixtureDirectory}.`);

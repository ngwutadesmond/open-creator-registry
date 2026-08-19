import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '../../test/render';
import { errorResponse, jsonResponse, requestMeta } from '../../test/fixtures';
import BulkSubmissionPanel from './BulkSubmissionPanel';

const csv = `creator_name,category,countries,requested_usernames,public_sources
Registry Bulk UI One,Music,Nigeria,registry_bulk_ui_one,https://example.test/ui-one
Registry Bulk UI Duplicate,Music,GH,registry_bulk_ui_duplicate,https://example.test/ui-duplicate
Registry Bulk UI Warning,Technology,US,registry_bulk_ui_warning,https://example.test/ui-warning
Registry Bulk UI Invalid,Made Up,ZZ,bad/handle,not-a-url
`;

const previewData = {
  preview_checksum: 'a'.repeat(64),
  summary: {
    total_rows: 4,
    ready: 1,
    exact_duplicates: 1,
    possible_duplicates: 1,
    invalid: 1,
    rows_with_warnings: 2,
  },
  rows: [
    {
      row_number: 2,
      status: 'ready',
      normalized: {
        creator_name: 'Registry Bulk UI One',
        category: 'music',
        country_codes: ['NG'],
        requested_handles: ['registry_bulk_ui_one'],
        public_sources: ['https://example.test/ui-one'],
      },
      fingerprint: '1'.repeat(64),
      duplicate_scope: null,
      duplicate_of_row: null,
      errors: [],
      warnings: [],
    },
    {
      row_number: 3,
      status: 'exact_duplicate',
      normalized: {
        creator_name: 'Registry Bulk UI Duplicate',
        category: 'music',
        country_codes: ['GH'],
        requested_handles: ['registry_bulk_ui_duplicate'],
        public_sources: ['https://example.test/ui-duplicate'],
      },
      fingerprint: '2'.repeat(64),
      duplicate_scope: 'existing',
      duplicate_of_row: null,
      errors: [],
      warnings: [
        {
          code: 'existing_active_duplicate',
          field: 'row',
          message: 'An equivalent pending or under-review submission already exists.',
        },
      ],
    },
    {
      row_number: 4,
      status: 'possible_duplicate',
      normalized: {
        creator_name: 'Registry Bulk UI Warning',
        category: 'technology',
        country_codes: ['US'],
        requested_handles: ['registry_bulk_ui_warning'],
        public_sources: ['https://example.test/ui-warning'],
      },
      fingerprint: '3'.repeat(64),
      duplicate_scope: null,
      duplicate_of_row: null,
      errors: [],
      warnings: [
        {
          code: 'approved_creator_same_name',
          field: 'creator_name',
          message: 'An approved creator uses the same normalized public name.',
        },
      ],
    },
    {
      row_number: 5,
      status: 'invalid',
      normalized: null,
      fingerprint: null,
      duplicate_scope: null,
      duplicate_of_row: null,
      errors: [
        {
          code: 'unsupported_category',
          field: 'category',
          message: 'Use a supported category value or display label.',
        },
      ],
      warnings: [],
    },
  ],
} as const;

const resultData = {
  batch_reference: 'ba000000-0000-4000-8000-000000000001',
  preview_checksum: previewData.preview_checksum,
  idempotent_replay: false,
  submitted_rows: 2,
  skipped_exact_duplicates: 1,
  skipped_within_file_duplicates: 0,
  possible_duplicates_excluded: 0,
  invalid_rows: 1,
  failed_rows: 0,
  total_pending_submissions_created: 2,
  rows: [
    {
      row_number: 2,
      status: 'submitted',
      submission_id: 'ba000000-0000-4000-8000-000000000002',
      messages: [],
    },
    {
      row_number: 3,
      status: 'skipped_exact_duplicate',
      submission_id: null,
      messages: ['An equivalent pending submission already exists.'],
    },
    {
      row_number: 4,
      status: 'submitted',
      submission_id: 'ba000000-0000-4000-8000-000000000004',
      messages: [],
    },
    {
      row_number: 5,
      status: 'invalid',
      submission_id: null,
      messages: ['Unsupported category.'],
    },
  ],
} as const;

function uploadFile(name = 'creators.csv', contents = csv): File {
  return new File([contents], name, { type: 'text/csv' });
}

function mockSuccessfulApi() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
    String(input).endsWith('/preview')
      ? jsonResponse({ data: previewData, meta: requestMeta })
      : jsonResponse({ data: resultData, meta: requestMeta }),
  );
}

let createObjectUrlMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createObjectUrlMock = vi.fn(() => 'blob:bulk-report');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectUrlMock,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('BulkSubmissionPanel', () => {
  it('explains the safe empty state and exposes keyboard-accessible template and file actions', () => {
    renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Upload multiple creators' })).toBeVisible();
    expect(screen.getByText(/Raw spreadsheet files are parsed in your browser/iu)).toBeVisible();
    expect(screen.getByText(/maximum 2 MiB/iu)).toBeVisible();
    expect(screen.getByLabelText(/choose file/iu)).toHaveAttribute(
      'accept',
      expect.stringContaining('.xlsx'),
    );
    expect(screen.getByRole('button', { name: 'Download CSV template' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download Excel template' })).toBeEnabled();
  });

  it('downloads both locally generated templates', async () => {
    const user = userEvent.setup();
    renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Download CSV template' }));
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Download Excel template' }));
    await waitFor(() => expect(createObjectUrlMock).toHaveBeenCalledTimes(2));
  });

  it('parses a file, shows mapping and filters, and applies safe selection defaults', async () => {
    vi.stubGlobal('fetch', mockSuccessfulApi());
    const user = userEvent.setup();
    renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);

    await user.upload(screen.getByLabelText(/choose file/iu), uploadFile());
    expect(await screen.findByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
    expect(screen.getByText('4', { selector: '.bulk-preview-summary dd' })).toBeVisible();
    expect(screen.getAllByText('creator_name')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Submit row 2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Submit row 3' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: /Include possible duplicate row 4/iu }),
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Submit row 5' })).toBeDisabled();
    expect(screen.getByText('1 rows will be submitted')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Invalid' }));
    expect(screen.getByText('Use a supported category value or display label.')).toBeVisible();
    expect(screen.queryByText('Registry Bulk UI One')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Registry Bulk UI One')).toBeVisible();
  });

  it('requires deliberate possible-duplicate and final confirmation before one commit request', async () => {
    const fetchMock = mockSuccessfulApi();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);
    await user.upload(screen.getByLabelText(/choose file/iu), uploadFile());
    await screen.findByRole('heading', { name: 'Spreadsheet preview' });

    await user.click(screen.getByRole('checkbox', { name: /Include possible duplicate row 4/iu }));
    expect(screen.getByText('2 rows will be submitted')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review 2 selected rows' }));
    expect(screen.getByRole('button', { name: 'Submit selected rows' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I confirm/iu }));
    await user.dblClick(screen.getByRole('button', { name: 'Submit selected rows' }));

    expect(await screen.findByRole('heading', { name: 'Spreadsheet processed' })).toBeVisible();
    expect(screen.getByText('ba000000-0000-4000-8000-000000000001')).toBeVisible();
    expect(screen.getByText('No review time or approval is guaranteed.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const commitInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(commitInit.body))).toMatchObject({
      preview_checksum: previewData.preview_checksum,
      selected_row_numbers: [2, 4],
      confirmed_possible_duplicate_row_numbers: [4],
    });
  });

  it('supports drag-and-drop and preserves the preview after a recoverable commit error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: previewData, meta: requestMeta }))
      .mockResolvedValueOnce(errorResponse(429, 'rate_limited', 'Too many requests.'));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);
    const dropZone = container.querySelector('.bulk-drop-zone');
    expect(dropZone).not.toBeNull();
    fireEvent.drop(dropZone as Element, { dataTransfer: { files: [uploadFile()] } });
    await screen.findByRole('heading', { name: 'Spreadsheet preview' });
    await user.click(screen.getByRole('button', { name: 'Review 1 selected rows' }));
    await user.click(screen.getByRole('checkbox', { name: /I confirm/iu }));
    await user.click(screen.getByRole('button', { name: 'Submit selected rows' }));

    expect(await screen.findByText(/Too many bulk requests/iu)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
    expect(screen.getByText(/Request ID:/iu)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit selected rows' })).toBeEnabled();
  });

  it('rejects unsupported files locally without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithRouter(<BulkSubmissionPanel onSubmitOne={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/choose file/iu), {
      target: {
        files: [new File(['legacy'], 'creators.xls', { type: 'application/vnd.ms-excel' })],
      },
    });
    expect(await screen.findByText(/\.xls files are not supported/iu)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ApiTesterPage from './ApiTesterPage';
import ReleasesPage from './ReleasesPage';
import SubmissionPage from './SubmissionPage';
import {
  errorResponse,
  jsonResponse,
  pagination,
  registryMeta,
  requestMeta,
} from '../test/fixtures';
import { renderWithRouter } from '../test/render';

async function fillValidSubmission(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /creator public name/i }), 'Demo New Voice');
  await user.type(screen.getByRole('textbox', { name: 'Handle 1' }), 'demo_new_voice');
  await user.type(
    screen.getByRole('textbox', { name: 'Source URL 1' }),
    'https://example.com/demo-new-voice',
  );
}

describe('SubmissionPage', () => {
  it('validates required public evidence locally and keeps entered values', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);

    await user.type(
      screen.getByRole('textbox', { name: /creator public name/i }),
      'Demo New Voice',
    );
    await user.type(screen.getByRole('textbox', { name: 'Handle 1' }), 'bad/handle');
    await user.type(screen.getByRole('textbox', { name: 'Source URL 1' }), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(screen.getByRole('heading', { name: 'Review the submission' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Demo New Voice')).toBeInTheDocument();
    expect(screen.getAllByText(/not a supported handle/i)).toHaveLength(2);
    expect(screen.getAllByText(/complete public http or https URL/i)).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits the API-supported fields and truthfully reports pending review', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(
        {
          data: {
            id: '00000000-0000-4000-8000-000000000501',
            submission_status: 'pending',
            created_at: '2026-07-21T12:00:00.000Z',
            message: 'Submission received for review.',
          },
          meta: requestMeta,
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);
    await fillValidSubmission(user);

    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(
      await screen.findByRole('heading', { name: 'Thank you for contributing public evidence.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      category: null,
      country_codes: null,
      creator_name: 'Demo New Voice',
      public_sources: ['https://example.com/demo-new-voice'],
      requested_handles: ['demo_new_voice'],
    });
  });

  it('preserves a duplicate proposal and exposes the request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(409, 'duplicate_submission', 'A matching proposal exists.')),
    );
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);
    await fillValidSubmission(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(
      await screen.findByRole('heading', { name: 'This proposal is already pending' }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Demo New Voice')).toBeInTheDocument();
    expect(screen.getByText(/request id/i)).toBeInTheDocument();
  });
});

describe('ReleasesPage', () => {
  it('does not invent a published release for the local seed state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/releases')
          ? jsonResponse({
              data: [],
              pagination: { ...pagination, total: 0, total_pages: 0 },
              meta: requestMeta,
            })
          : jsonResponse(registryMeta),
      ),
    );
    renderWithRouter(<ReleasesPage />);

    expect(await screen.findByText('Unversioned development state')).toBeInTheDocument();
    expect(screen.getByText('No Registry release has been published yet.')).toBeInTheDocument();
    expect(screen.getByText('No published releases')).toBeInTheDocument();
  });
});

describe('ApiTesterPage', () => {
  it('sends only a supported public GET and shows response metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: { status: 'ok', database: 'ok' }, meta: requestMeta }, 200, {
          'Cache-Control': 'no-store',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<ApiTesterPage />);

    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('200')).toBeInTheDocument();
    expect(screen.getByText('no-store')).toBeInTheDocument();
    expect(screen.getAllByText(/api\/v1\/health/i)).toHaveLength(2);
  });
});

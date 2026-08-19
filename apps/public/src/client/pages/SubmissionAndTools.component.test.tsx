import { screen, waitFor } from '@testing-library/react';
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
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'music');
  await user.type(screen.getByRole('textbox', { name: 'Username 1' }), 'demo_new_voice');
  await user.type(
    screen.getByRole('textbox', { name: 'Supporting source 1' }),
    'https://example.com/demo-new-voice',
  );
}

describe('SubmissionPage', () => {
  it('renders the complete controlled category list with no initial selection', () => {
    renderWithRouter(<SubmissionPage />);

    const category = screen.getByRole('combobox', { name: 'Category' });
    expect(category).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Select a category' })).toBeInTheDocument();
    [
      'Music',
      'Film & Television',
      'Comedy',
      'Content Creator / Influencer',
      'Gaming / Streaming',
      'Sports',
      'Fashion / Beauty',
      'Visual Arts / Design',
      'Dance / Choreography',
      'Writing / Publishing',
      'Podcasting / Audio',
      'Education',
      'Technology',
      'Business / Entrepreneurship',
      'Other',
    ].forEach((label) => expect(screen.getByRole('option', { name: label })).toBeInTheDocument());
  });

  it('validates required fields locally, links row errors, and preserves entered values', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);

    await user.type(
      screen.getByRole('textbox', { name: /creator public name/i }),
      'Demo New Voice',
    );
    await user.type(screen.getByRole('textbox', { name: 'Username 1' }), 'bad/handle');
    await user.type(
      screen.getByRole('textbox', { name: 'Supporting source 1' }),
      'javascript:alert(1)',
    );
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(screen.getByRole('heading', { name: 'Review the submission' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Demo New Voice')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Select a category.' })).toHaveAttribute(
      'href',
      '#submission-category',
    );
    expect(screen.getByRole('textbox', { name: 'Username 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Supporting source 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches countries by name and code, selects multiple, removes a chip, and restores focus', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);
    const countrySearch = screen.getByRole('combobox', { name: /countries/i });

    await user.type(countrySearch, 'Nigeria');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getAllByText('Nigeria (NG)')).toHaveLength(2);
    expect(countrySearch).toHaveFocus();

    await user.type(countrySearch, 'GH');
    await user.click(screen.getByRole('option', { name: 'Ghana (GH)' }));
    expect(screen.getAllByText('Ghana (GH)')).toHaveLength(1);
    expect(screen.getByText('2 of 10 countries selected')).toBeInTheDocument();

    await user.click(countrySearch);
    expect(countrySearch).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(countrySearch).toHaveAttribute('aria-expanded', 'false');
    expect(countrySearch).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Remove Nigeria (NG)' }));
    expect(screen.queryByText('Nigeria (NG)')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 10 countries selected')).toBeInTheDocument();
    await waitFor(() => expect(countrySearch).toHaveFocus());
  });

  it('prevents an eleventh country selection', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);
    const countrySearch = screen.getByRole('combobox', { name: /countries/i });
    for (const country of [
      'Andorra',
      'United Arab Emirates',
      'Afghanistan',
      'Antigua & Barbuda',
      'Anguilla',
      'Albania',
      'Armenia',
      'Angola',
      'Antarctica',
      'Argentina',
    ]) {
      await user.type(countrySearch, country);
      await user.keyboard('{ArrowDown}{Enter}');
    }

    expect(screen.getByText('10 of 10 countries selected')).toBeInTheDocument();
    await user.type(countrySearch, 'Australia');
    expect(screen.getByText(/Remove a country before selecting another/i)).toBeInTheDocument();
    expect(screen.queryByText('Australia (AU)')).not.toBeInTheDocument();
  });

  it('adds, focuses, validates, and removes username rows with normalized duplicate detection', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);

    await user.type(screen.getByRole('textbox', { name: 'Username 1' }), 'creator-handle');
    await user.click(screen.getByRole('button', { name: 'Add another username' }));
    const second = screen.getByRole('textbox', { name: 'Username 2' });
    await waitFor(() => expect(second).toHaveFocus());
    await user.type(second, '@Creator.Handle');
    await user.tab();
    expect(second).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/duplicates username 1 after normalization/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove username 2' }));
    expect(screen.queryByRole('textbox', { name: 'Username 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove username 1' })).not.toBeInTheDocument();
  });

  it('adds source rows and reports invalid protocols and duplicate URLs on each row', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);

    const first = screen.getByRole('textbox', { name: 'Supporting source 1' });
    await user.type(first, 'ftp://example.com/profile');
    await user.tab();
    expect(first).toHaveAttribute('aria-invalid', 'true');

    await user.clear(first);
    await user.type(first, 'https://example.com/profile');
    await user.click(screen.getByRole('button', { name: 'Add another source' }));
    const second = screen.getByRole('textbox', { name: 'Supporting source 2' });
    await waitFor(() => expect(second).toHaveFocus());
    await user.type(second, 'https://EXAMPLE.com/profile');
    await user.tab();
    expect(second).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/duplicates source 1/i)).toBeInTheDocument();
  });

  it('enforces the ten-row maximum for usernames and supporting sources', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);

    const addUsername = screen.getByRole('button', { name: 'Add another username' });
    const addSource = screen.getByRole('button', { name: 'Add another source' });
    for (let index = 1; index < 10; index += 1) {
      await user.click(addUsername);
      await user.click(addSource);
    }

    expect(screen.getByText('10 of 10 usernames added')).toBeInTheDocument();
    expect(screen.getByText('10 of 10 sources added')).toBeInTheDocument();
    expect(addUsername).toBeDisabled();
    expect(addSource).toBeDisabled();
    expect(screen.getAllByRole('textbox', { name: /Username \d+/ })).toHaveLength(10);
    expect(screen.getAllByRole('textbox', { name: /Supporting source \d+/ })).toHaveLength(10);
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

    const countrySearch = screen.getByRole('combobox', { name: /countries/i });
    await user.type(countrySearch, 'NG');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    expect(await screen.findByRole('heading', { name: 'Submission received' })).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      category: 'music',
      country_codes: ['NG'],
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

  it('presents rate-limit and recoverable network failures without clearing the form', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(429, 'rate_limited', 'Too many requests.')),
    );
    renderWithRouter(<SubmissionPage />);
    await fillValidSubmission(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(
      await screen.findByRole('heading', { name: 'Too many submission attempts' }),
    ).toBeVisible();
    expect(screen.getByDisplayValue('Demo New Voice')).toBeInTheDocument();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(
      await screen.findByRole('heading', { name: 'The Registry could not be reached' }),
    ).toBeVisible();
    expect(screen.getByDisplayValue('Demo New Voice')).toBeInTheDocument();
  });

  it('prevents a double click from sending two submissions', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<SubmissionPage />);
    await fillValidSubmission(user);

    await user.dblClick(screen.getByRole('button', { name: 'Submit for review' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();

    resolveRequest?.(
      jsonResponse(
        {
          data: {
            id: '00000000-0000-4000-8000-000000000502',
            submission_status: 'pending',
            created_at: '2026-07-21T12:00:00.000Z',
            message: 'Submission received for review.',
          },
          meta: requestMeta,
        },
        201,
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Submission received' })).toBeVisible();
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
    expect(
      screen.getByText(
        'No Registry release has been published. Public data remains unversioned until an authorised administrator publishes a reviewed release.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/local demonstration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/phase 5/i)).not.toBeInTheDocument();
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

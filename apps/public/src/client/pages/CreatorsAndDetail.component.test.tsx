import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CreatorDetailPage from './CreatorDetailPage';
import CreatorsPage from './CreatorsPage';
import {
  alias,
  creator,
  creatorDetail,
  errorResponse,
  handle,
  jsonResponse,
  pagination,
  requestMeta,
} from '../test/fixtures';
import { renderWithRouter } from '../test/render';

function creatorList(creators = [creator], overrides = {}) {
  return {
    data: creators,
    pagination: { ...pagination, total: creators.length, ...overrides },
    meta: requestMeta,
  };
}

describe('CreatorsPage', () => {
  it('loads reviewed creators and sends URL-backed search and filters to the API', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(creatorList()));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<CreatorsPage />, '/creators');

    expect(await screen.findByText('Demo Aurora Vale')).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Creator, alias, handle, or source identifier' }),
      'Aurora',
    );
    await user.click(screen.getByRole('button', { name: 'Search Registry' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Country' }), 'NG');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Protection tier' }), 'critical');

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.some((url) => url.includes('query=Aurora'))).toBe(true);
      expect(calls.some((url) => url.includes('country=NG'))).toBe(true);
      expect(calls.some((url) => url.includes('protection_tier=critical'))).toBe(true);
    });
  });

  it('shows an actionable empty state and can clear all filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(creatorList([], { total_pages: 0 })))
      .mockResolvedValueOnce(jsonResponse(creatorList()));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<CreatorsPage />, '/creators?query=missing');

    expect(await screen.findByText('No creator records matched')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browse all creators' }));
    expect(await screen.findByText('Demo Aurora Vale')).toBeInTheDocument();
  });

  it('exposes database failures and retries without replacing the page shell', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, 'database_unavailable', 'Registry unavailable.'))
      .mockResolvedValueOnce(jsonResponse(creatorList()));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<CreatorsPage />);

    expect(await screen.findByText('Registry unavailable.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Demo Aurora Vale')).toBeInTheDocument();
  });

  it('renders server pagination without fetching an unbounded result set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          creatorList([creator], {
            total: 25,
            total_pages: 3,
            has_next_page: true,
          }),
        ),
      ),
    );
    renderWithRouter(<CreatorsPage />);

    expect(await screen.findByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('CreatorDetailPage', () => {
  it('loads the public record, handles, aliases, and safe source links in parallel', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/handles?limit=100')) {
        return jsonResponse({ data: [handle], pagination, meta: requestMeta });
      }
      if (url.endsWith('/aliases?limit=100')) {
        return jsonResponse({ data: [alias], pagination, meta: requestMeta });
      }
      return jsonResponse({ data: creatorDetail, meta: requestMeta });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithRouter(<CreatorDetailPage />, `/creators/${creator.id}`);

    expect(await screen.findByRole('heading', { name: 'Demo Aurora Vale' })).toBeInTheDocument();
    expect(screen.getByText('@demo_aurora_vale')).toBeInTheDocument();
    expect(screen.getByText('Aurora Vale')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open source/i })).toHaveAttribute(
      'href',
      'https://example.com/demo-aurora-vale',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the creator useful when a secondary aliases request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/aliases?limit=100')) {
          return errorResponse(503, 'database_unavailable', 'Aliases are temporarily unavailable.');
        }
        if (url.endsWith('/handles?limit=100')) {
          return jsonResponse({ data: [handle], pagination, meta: requestMeta });
        }
        return jsonResponse({ data: creatorDetail, meta: requestMeta });
      }),
    );
    renderWithRouter(<CreatorDetailPage />, `/creators/${creator.id}`);

    expect(await screen.findByRole('heading', { name: 'Demo Aurora Vale' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aliases unavailable' })).toBeInTheDocument();
    expect(screen.getByText('@demo_aurora_vale')).toBeInTheDocument();
  });

  it('distinguishes an unknown reviewed creator from a transient error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errorResponse(404, 'not_found', 'Not found.')),
    );
    renderWithRouter(<CreatorDetailPage />, `/creators/${creator.id}`);

    expect(await screen.findByText('Creator record not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to creator search' })).toBeInTheDocument();
  });
});

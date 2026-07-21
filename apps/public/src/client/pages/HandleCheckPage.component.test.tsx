import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HandleCheckPage from './HandleCheckPage';
import { errorResponse, handleCheckResponse, jsonResponse } from '../test/fixtures';
import { renderWithRouter } from '../test/render';

describe('HandleCheckPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/check');
  });

  it('renders an exact hard-reserved decision from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(handleCheckResponse('hard_reserved', 'exact_handle'))),
    );
    const user = userEvent.setup();
    renderWithRouter(<HandleCheckPage />, '/check');

    await user.type(
      screen.getByRole('textbox', { name: 'Username or handle' }),
      'demo_aurora_vale',
    );
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Hard reserved')).toBeInTheDocument();
    expect(screen.getByText(/do not assign this username/i)).toBeInTheDocument();
    expect(screen.getByText('Demo Aurora Vale')).toBeInTheDocument();
    expect(screen.queryByText(/username available/i)).not.toBeInTheDocument();
  });

  it('keeps a not-listed result distinct from username availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(handleCheckResponse('not_listed', 'none'))),
    );
    const user = userEvent.setup();
    renderWithRouter(<HandleCheckPage />);

    await user.type(screen.getByRole('textbox', { name: 'Username or handle' }), 'ordinary_name');
    await user.click(screen.getByRole('button', { name: 'Check protection status' }));

    expect(await screen.findByText('Not listed')).toBeInTheDocument();
    expect(
      screen.getByText(/must still perform its own availability and abuse checks/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/username is available/i)).not.toBeInTheDocument();
  });

  it('labels confusable and ambiguous matches as review signals, not identity proof', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          handleCheckResponse('soft_protected', 'confusable_skeleton', { ambiguous: true }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<HandleCheckPage />);

    await user.click(screen.getByRole('button', { name: '@real-demo-aurora-vale' }));

    expect(await screen.findByText('Manual review required.')).toBeInTheDocument();
    expect(screen.getByText(/visual similarity is a risk indicator/i)).toBeInTheDocument();
    expect(screen.queryByText('Associated public creator')).not.toBeInTheDocument();
  });

  it('rejects invalid input locally without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<HandleCheckPage />);

    await user.type(screen.getByRole('textbox', { name: 'Username or handle' }), '@@@');
    await user.click(screen.getByRole('button', { name: 'Check protection status' }));

    expect(await screen.findByText(/must contain supported characters/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows stable API errors with a request ID and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, 'database_unavailable', 'Registry unavailable.'))
      .mockResolvedValueOnce(jsonResponse(handleCheckResponse('monitored', 'monitored_variant')));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<HandleCheckPage />);

    await user.click(screen.getByRole('button', { name: '@demo_aurora_vale_fans' }));
    expect(await screen.findByRole('heading', { name: 'Handle check failed' })).toBeInTheDocument();
    expect(
      screen.getByText(`Request ID: 00000000-0000-4000-8000-000000000001`),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Monitored')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

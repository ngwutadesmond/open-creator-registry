import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminApp } from './AdminApp';

const meta = {
  request_id: '90000000-0000-4000-8000-000000000001',
  timestamp: '2026-07-21T18:00:00.000Z',
};
const localIdentity = {
  subject: 'local:admin@example.test',
  email: 'admin@example.test',
  display_name: 'Local Registry Admin',
  roles: ['super_admin'],
  permissions: [
    'dashboard:read',
    'creators:create',
    'creators:read',
    'creators:update',
    'handles:create',
  ],
  authentication_source: 'local_development',
};
let identity = localIdentity;

describe('AdminApp', () => {
  beforeEach(() => {
    identity = localIdentity;
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/me')) return Response.json({ data: identity, meta });
        if (path.endsWith('/dashboard'))
          return Response.json({
            data: {
              metrics: {
                approved_creators: 10,
                active_handles: 12,
                hard_handles: 5,
                soft_handles: 4,
                monitored_handles: 3,
                pending_candidates: 0,
                pending_submissions: 0,
                pending_approvals: 0,
              },
              latest_release: null,
              recent_runs: [],
              recent_audits: [],
              demonstration_data: true,
            },
            meta,
          });
        return Response.json(
          { error: { code: 'not_found', message: 'Not found', details: [] }, meta },
          { status: 404 },
        );
      }),
    );
  });

  it('renders live database metrics inside the private administration shell', async () => {
    render(<AdminApp />);
    expect(
      await screen.findByRole('heading', { name: 'Registry administration' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Local Registry Admin')).toBeInTheDocument();
    expect(screen.getByText('Approved creators')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/Remote environments remain denied/)).toBeInTheDocument();
    expect(screen.getByText('Environment-scoped Registry database')).toBeInTheDocument();
    expect(screen.queryByText(/available in Phase 5/)).not.toBeInTheDocument();
  });

  it('describes a remotely authenticated identity without local-environment claims', async () => {
    identity = {
      ...localIdentity,
      subject: 'access:administrator@example.test',
      display_name: 'Staging Registry Admin',
      authentication_source: 'cloudflare_access',
    };
    render(<AdminApp />);
    expect(
      await screen.findByRole('heading', { name: 'Registry administration' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare Access identity/)).toBeInTheDocument();
    expect(screen.getByText(/server-side role mapping/)).toBeInTheDocument();
    expect(screen.queryByText(/Local development identity/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current administrator')).toBeInTheDocument();
  });

  it('does not render local identity controls for a Cloudflare Access administrator', async () => {
    identity = {
      ...localIdentity,
      subject: 'access:administrator@example.test',
      display_name: 'Production Registry Admin',
      authentication_source: 'cloudflare_access',
    };
    window.history.replaceState({}, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<AdminApp />);

    expect(
      await screen.findByRole('heading', { name: 'Administration settings' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use primary local admin' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use secondary local admin' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Remote access remains fail closed')).toBeInTheDocument();
    expect(screen.getByText(/Worker revalidates/)).toBeInTheDocument();
    expect(screen.queryByText(/until Phase 7/)).not.toBeInTheDocument();
  });

  it('retains local identity controls in local development', async () => {
    window.history.replaceState({}, '', '/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<AdminApp />);

    expect(
      await screen.findByRole('heading', { name: 'Administration settings' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use primary local admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use secondary local admin' })).toBeInTheDocument();
  });

  it('exposes the administration navigation without linking to it from the public app', async () => {
    render(<AdminApp />);
    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { name: 'Administration navigation' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Creators/ })).toHaveAttribute('href', '/creators');
    expect(screen.getByRole('link', { name: /Approvals/ })).toHaveAttribute('href', '/approvals');
    expect(screen.getAllByText(/Private application/)).toHaveLength(2);
  });

  it('does not request an undefined creator while rendering the creation route', async () => {
    window.history.replaceState({}, '', '/creators/new');
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: 'Create creator' })).toBeInTheDocument();
    const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(requests.some((request) => request.includes('/creators/undefined'))).toBe(false);
  });
});

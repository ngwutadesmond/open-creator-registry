import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminApp } from './AdminApp';

const id = '90000000-0000-4000-8000-000000000002';
const meta = {
  request_id: '90000000-0000-4000-8000-000000000001',
  timestamp: '2026-07-21T18:00:00.000Z',
};
const fixture = {
  id,
  action_type: 'handle.create_critical',
  entity_type: 'creator_entity',
  entity_id: null,
  requested_by: 'admin@example.test',
  requested_payload: { displayHandle: 'demonstration_expiry' },
  reason: 'Demonstration proposal for an elapsed deadline.',
  status: 'pending',
  required_approvals: 1,
  approval_count: 0,
  target_revision: null,
  expires_at: meta.timestamp,
  created_at: '2026-07-20T18:00:00.000Z',
  updated_at: '2026-07-20T18:00:00.000Z',
  resolved_at: null as string | null,
  applied_at: null,
};

describe('approval deadline reconciliation', () => {
  let approval = { ...fixture };
  let permissions: string[];
  let mutationError: boolean;

  beforeEach(() => {
    approval = { ...fixture };
    permissions = ['approvals:read', 'approvals:decide'];
    mutationError = false;
    window.history.replaceState({}, '', `/approvals/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith('/me'))
          return Response.json({
            data: {
              subject: 'local:admin@example.test',
              email: 'admin@example.test',
              display_name: 'Demonstration administrator',
              roles: ['publisher'],
              permissions,
              authentication_source: 'local_development',
            },
            meta,
          });
        if (path === `/api/admin/v1/approval-requests/${id}`) {
          return Response.json({ data: { approval, decisions: [] }, meta });
        }
        if (path.endsWith('/expire') && init?.method === 'POST') {
          if (mutationError)
            return Response.json(
              {
                error: {
                  code: 'invalid_input',
                  message: 'The approval changed. Refresh and review it again.',
                  details: [],
                },
                meta,
              },
              { status: 422 },
            );
          approval = {
            ...approval,
            status: 'expired',
            updated_at: meta.timestamp,
            resolved_at: meta.timestamp,
          };
          return Response.json({ data: approval, meta });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
  });

  it('confirms expiry, sends the observed revision, and reloads the authoritative detail', async () => {
    const user = userEvent.setup();
    render(<AdminApp />);
    await user.click(await screen.findByRole('button', { name: 'Mark expired' }));
    expect(screen.getByRole('button', { name: 'Approve independently' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject request' })).toBeDisabled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'does not approve, apply, or reissue',
    );
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm expiry' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark expired' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('expired', { exact: true })).toBeVisible();
    const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toBe(`/api/admin/v1/approval-requests/${id}/expire`);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({
      reason: 'Recorded the elapsed approval deadline without applying the proposed change.',
      expected_revision: fixture.updated_at,
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([path]) => path === `/api/admin/v1/approval-requests/${id}`).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('keeps a failed expiry visible for review without showing success', async () => {
    mutationError = true;
    const user = userEvent.setup();
    render(<AdminApp />);
    await user.click(await screen.findByRole('button', { name: 'Mark expired' }));
    await user.click(screen.getByRole('button', { name: 'Confirm expiry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh and review it again');
    expect(screen.getByRole('button', { name: 'Mark expired' })).toBeEnabled();
    expect(screen.queryByText('expired', { exact: true })).not.toBeInTheDocument();
  });

  it('offers approval but no expiry before the server-reported deadline', async () => {
    approval.expires_at = '2026-07-22T18:00:00.000Z';
    render(<AdminApp />);
    expect(await screen.findByRole('button', { name: 'Approve independently' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Mark expired' })).not.toBeInTheDocument();
  });

  it('does not offer mutations without decision permission', async () => {
    permissions = ['approvals:read'];
    render(<AdminApp />);
    expect(await screen.findByRole('button', { name: 'Approve independently' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark expired' })).not.toBeInTheDocument();
  });
});

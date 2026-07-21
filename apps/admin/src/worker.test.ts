import { describe, expect, it } from 'vitest';

import app from './worker';

function hasRequestId(value: unknown): value is { meta: { request_id: string } } {
  if (typeof value !== 'object' || value === null || !('meta' in value)) {
    return false;
  }

  const { meta } = value;
  return (
    typeof meta === 'object' &&
    meta !== null &&
    'request_id' in meta &&
    typeof meta.request_id === 'string'
  );
}

describe('admin Worker boundary', () => {
  it('does not pretend that private Phase 5 routes are available', async () => {
    const response = await app.request('/api/admin/dashboard');
    const body: unknown = await response.json();

    expect(response.status).toBe(501);
    expect(body).toMatchObject({
      data: null,
      error: {
        code: 'not_implemented',
        message: 'The private administration API is delivered in Phase 5.',
      },
    });
    expect(hasRequestId(body)).toBe(true);
    if (!hasRequestId(body)) {
      throw new Error('Expected the admin Worker response to contain a request ID.');
    }
    expect(body.meta.request_id).toMatch(/^[0-9a-f-]{36}$/u);
  });
});

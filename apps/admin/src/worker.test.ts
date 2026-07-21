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
  it('fails closed when administrator authentication is not configured', async () => {
    const response = await app.request('/api/admin/v1/dashboard', undefined, {
      ENVIRONMENT: 'production',
      AUTH_PROVIDER: 'unconfigured',
      ADMIN_ALLOWED_ORIGINS: '',
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: {
        code: 'authentication_required',
      },
    });
    expect(hasRequestId(body)).toBe(true);
    if (!hasRequestId(body)) {
      throw new Error('Expected the admin Worker response to contain a request ID.');
    }
    expect(body.meta.request_id).toMatch(/^[0-9a-f-]{36}$/u);
  });
});

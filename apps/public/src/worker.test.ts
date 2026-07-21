import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from './api/routes';

describe('public Worker Phase 3 boundary', () => {
  it('registers public API routes without administration routes', () => {
    const document = createOpenApiDocument();

    expect(document.paths?.['/api/v1/health']).toBeDefined();
    expect(document.paths?.['/api/v1/handles/check']).toBeDefined();
    expect(document.paths?.['/api/v1/submissions']).toBeDefined();
    expect(JSON.stringify(document)).not.toContain('/api/admin');
  });
});

import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';

import { createAdminOpenApiDocument } from './openapi';

describe('generated administration OpenAPI document', () => {
  it('is structurally valid, private, authenticated, and complete', async () => {
    const document = createAdminOpenApiDocument();
    await expect(
      SwaggerParser.validate(document as unknown as Parameters<typeof SwaggerParser.validate>[0]),
    ).resolves.toBeDefined();
    const serialized = JSON.stringify(document);
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toContain('Administration');
    expect(document.security).toBeDefined();
    expect(serialized).toContain('/api/admin/v1/creators');
    expect(serialized).toContain('/api/admin/v1/imports/preview');
    expect(serialized).toContain('/api/admin/v1/approval-requests');
    expect(serialized).toContain('/api/admin/v1/audit-logs');
    expect(serialized).toContain('Critical changes require');
    expect(serialized).not.toContain('/api/v1/handles/check');
  });
});

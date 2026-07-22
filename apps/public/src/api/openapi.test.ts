import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';

import {
  recommendedActions,
  registryClassifications,
} from '@open-creator-registry/contracts/classifications';

import { createOpenApiDocument } from './routes';

describe('generated public OpenAPI document', () => {
  it('is structurally valid and contains every public route without administration paths', async () => {
    const document = createOpenApiDocument();
    await expect(
      SwaggerParser.validate(document as unknown as Parameters<typeof SwaggerParser.validate>[0]),
    ).resolves.toBeDefined();

    const expectedPaths = [
      '/api/v1/health',
      '/api/v1/handles/check',
      '/api/v1/handles/check-batch',
      '/api/v1/creators',
      '/api/v1/creators/{creatorId}',
      '/api/v1/creators/{creatorId}/handles',
      '/api/v1/creators/{creatorId}/aliases',
      '/api/v1/creators/{creatorId}/profiles',
      '/api/v1/registry/meta',
      '/api/v1/registry/releases',
      '/api/v1/submissions',
      '/openapi.json',
      '/docs',
    ];
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(expectedPaths.sort());
    expect(JSON.stringify(document)).not.toContain('/api/admin');
    expect(document.info.title).toBe('Open Creator Registry API');
    expect(document.security).toEqual([]);
  });

  it('documents classifications, actions, pagination, errors, and availability semantics', () => {
    const serialized = JSON.stringify(createOpenApiDocument());
    registryClassifications.forEach((classification) =>
      expect(serialized).toContain(classification),
    );
    recommendedActions.forEach((action) => expect(serialized).toContain(action));
    expect(serialized).toContain('total_pages');
    expect(serialized).toContain('validation_failed');
    expect(serialized).toContain('not legal ownership');
    expect(serialized).not.toContain('username_available');
    expect(serialized).not.toContain('is_available');
  });
});

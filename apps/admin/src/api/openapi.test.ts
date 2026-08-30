import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';

import { createAdminOpenApiDocument } from './openapi';

type RequestSchema = {
  additionalProperties?: boolean;
  properties?: Record<string, { default?: unknown }>;
  required?: string[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requestSchema(
  document: ReturnType<typeof createAdminOpenApiDocument>,
  path: string,
  method: 'post' | 'patch',
): RequestSchema {
  const root = record(document, 'an OpenAPI document');
  const paths = record(root.paths, 'OpenAPI paths');
  const operation = record(record(paths[path], `the ${path} path`)[method], `${method} operation`);
  const requestBody = record(operation.requestBody, 'a request body');
  const content = record(requestBody.content, 'request body content');
  const mediaType = record(content['application/json'], 'an application/json media type');
  const schema = record(mediaType.schema, 'an inline request schema');
  if (!('properties' in schema)) throw new Error('Expected schema properties.');
  return schema;
}

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

  it('documents create defaults without applying them to PATCH requests', () => {
    const document = createAdminOpenApiDocument();
    const creatorCreate = requestSchema(document, '/api/admin/v1/creators', 'post');
    const creatorPatch = requestSchema(document, '/api/admin/v1/creators/{creatorId}', 'patch');
    const handleCreate = requestSchema(document, '/api/admin/v1/reserved-handles', 'post');
    const handlePatch = requestSchema(
      document,
      '/api/admin/v1/reserved-handles/{handleId}',
      'patch',
    );
    const profileCreate = requestSchema(
      document,
      '/api/admin/v1/creators/{creatorId}/profiles',
      'post',
    );
    const profilePatch = requestSchema(
      document,
      '/api/admin/v1/external-profiles/{profileId}',
      'patch',
    );

    expect(creatorCreate.properties?.notoriety_score?.default).toBe(0);
    expect(creatorCreate.properties?.allow_common_name_duplicate?.default).toBe(false);
    expect(creatorPatch.properties?.notoriety_score?.default).toBeUndefined();
    expect(creatorPatch.properties?.allow_common_name_duplicate?.default).toBeUndefined();
    expect(creatorPatch.required ?? []).toEqual([]);
    expect(creatorPatch.additionalProperties).toBe(false);

    expect(handleCreate.properties?.status?.default).toBe('active');
    expect(handlePatch.properties?.status?.default).toBeUndefined();
    expect(handlePatch.required ?? []).toEqual([]);
    expect(handlePatch.additionalProperties).toBe(false);

    expect(profileCreate.properties?.is_primary?.default).toBe(false);
    expect(profilePatch.properties?.is_primary?.default).toBeUndefined();
    expect(profilePatch.required).toEqual(['change_reason']);
    expect(profilePatch.additionalProperties).toBe(false);
  });
});

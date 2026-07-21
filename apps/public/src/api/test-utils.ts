import { env } from 'cloudflare:workers';

import { seedDatabase } from '@open-creator-registry/database/seed';
import { clearDatabase } from '../../../../packages/database/src/test/test-utils';

import type { RequestMetadataProvider } from './app-env';
import { createPublicApp } from './routes';

export const testBindings = {
  DB: env.DB,
  ENVIRONMENT: 'local',
  ALLOWED_ORIGINS: 'http://localhost:5173',
} satisfies import('./app-env').PublicRuntimeBindings;

export const deterministicRequestMetadata: RequestMetadataProvider = {
  createCspNonce: () => '00112233445566778899aabbccddeeff',
  createRequestId: () => '90000000-0000-4000-8000-000000000001',
  now: () => '2026-07-21T16:00:00.000Z',
};

export async function resetAndSeedApiDatabase(): Promise<void> {
  await clearDatabase();
  await seedDatabase(env.DB);
}

export function createTestPublicApp() {
  return createPublicApp({ metadata: deterministicRequestMetadata });
}

export async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  return createTestPublicApp().request(path, init, testBindings);
}

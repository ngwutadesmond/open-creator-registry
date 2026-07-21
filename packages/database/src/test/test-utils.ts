import { env } from 'cloudflare:workers';

import { createCreatorRepository } from '../repositories/creator-repository';

export async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM audit_logs'),
    env.DB.prepare('DELETE FROM creator_aliases'),
    env.DB.prepare('DELETE FROM creator_sources'),
    env.DB.prepare('DELETE FROM reserved_handles'),
    env.DB.prepare('DELETE FROM creator_candidates'),
    env.DB.prepare('DELETE FROM public_submissions'),
    env.DB.prepare('DELETE FROM registry_releases'),
    env.DB.prepare('DELETE FROM ingestion_runs'),
    env.DB.prepare('DELETE FROM creator_entities'),
  ]);
}

export async function createTestCreator(
  overrides: {
    canonicalName?: string;
    primaryCategory?: string;
    countryCodes?: string[];
    protectionTier?: 'critical' | 'notable' | 'watchlist' | 'standard';
  } = {},
) {
  return createCreatorRepository(env.DB).create({
    canonicalName: overrides.canonicalName ?? 'Test Creator',
    entityType: 'person',
    primaryCategory: overrides.primaryCategory ?? 'music',
    countryCodes: overrides.countryCodes ?? ['NG'],
    biographySummary: 'Integration-test creator record.',
    notorietyScore: 70,
    protectionTier: overrides.protectionTier ?? 'notable',
    reviewStatus: 'approved',
  });
}

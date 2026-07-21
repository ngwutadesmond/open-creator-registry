import { createSourceConfigurationRepository } from '@open-creator-registry/database/repositories/source-configuration-repository';

import type { IngestionResult, SourceConnectorContext } from './contracts';
import { createIngestionOrchestrator } from './orchestrator';
import type { SourceConnectorRegistry } from './registry';

export async function runScheduledIngestion(input: {
  db: D1Database;
  registry: SourceConnectorRegistry;
  connectorContext?: SourceConnectorContext;
  signal?: AbortSignal;
}): Promise<IngestionResult[]> {
  const configurations = await createSourceConfigurationRepository(input.db).listScheduledEnabled();
  const orchestrator = createIngestionOrchestrator({
    db: input.db,
    registry: input.registry,
    connectorContext: input.connectorContext,
  });
  const results: IngestionResult[] = [];
  for (const configuration of configurations) {
    try {
      results.push(
        await orchestrator.execute({
          sourceName: configuration.sourceName,
          triggerType: 'scheduled',
          maximumDurationMs: 60_000,
          signal: input.signal,
        }),
      );
    } catch {
      results.push({
        runId: null,
        sourceName: configuration.sourceName,
        scopeKey: 'default',
        status: 'failed',
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
        failedCount: 0,
        retryCount: 0,
        checkpointBefore: null,
        checkpointAfter: null,
        dryRun: configuration.dryRun,
        message: 'The scheduled source could not be processed.',
      });
    }
  }
  return results;
}

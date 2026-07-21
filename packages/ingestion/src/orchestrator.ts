import { createCandidateProvenanceRepository } from '@open-creator-registry/database/repositories/candidate-provenance-repository';
import { createCreatorCandidateRepository } from '@open-creator-registry/database/repositories/creator-candidate-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import { createExternalProfileRepository } from '@open-creator-registry/database/repositories/external-profile-repository';
import { createIngestionRecordOutcomeRepository } from '@open-creator-registry/database/repositories/ingestion-record-outcome-repository';
import { createIngestionRunRepository } from '@open-creator-registry/database/repositories/ingestion-run-repository';
import { createSourceCheckpointRepository } from '@open-creator-registry/database/repositories/source-checkpoint-repository';
import { createSourceConfigurationRepository } from '@open-creator-registry/database/repositories/source-configuration-repository';
import { createSourceLockRepository } from '@open-creator-registry/database/repositories/source-lock-repository';
import type { RecordMetadataProvider } from '@open-creator-registry/database/runtime';
import { defaultRecordMetadataProvider } from '@open-creator-registry/database/runtime';
import { normalizeExternalProfileUrl } from '@open-creator-registry/normalization/external-profiles';

import type {
  IngestionRecordResult,
  IngestionResult,
  MappedCreatorCandidate,
  SourceConnectorContext,
} from './contracts';
import { defaultConnectorContext, IngestionError } from './contracts';
import type { SourceConnectorRegistry } from './registry';

export type IngestionRunRequest = {
  sourceName: string;
  scopeKey?: string;
  triggerType?: 'manual_preview' | 'manual' | 'scheduled';
  preview?: boolean;
  maximumDurationMs?: number;
  leaseOwner?: string;
  signal?: AbortSignal;
};

type MutableCounts = {
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
};

function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof IngestionError) return { code: error.code, message: error.message };
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'INGESTION_ABORTED', message: 'The ingestion run was aborted.' };
  }
  return { code: 'INGESTION_FAILURE', message: 'The ingestion run could not be completed.' };
}

async function recommendMatch(db: D1Database, candidate: MappedCreatorCandidate) {
  const source = await createCreatorSourceRepository(db).findByExternalIdentity(
    candidate.provenance.sourceName,
    candidate.provenance.sourceEntityId,
  );
  if (source) {
    return {
      recommendation: 'likely_existing_creator' as const,
      creatorId: source.creatorEntityId,
    };
  }

  const strongCreatorIds = new Set<string>();
  const profiles = createExternalProfileRepository(db);
  for (const profile of candidate.externalProfiles) {
    if (profile.platformAccountId) {
      const match = await profiles.findByPlatformAccountId(
        profile.platform,
        profile.platformAccountId,
      );
      if (match) strongCreatorIds.add(match.creatorEntityId);
    }
    if (profile.profileUrl) {
      const normalizedUrl = normalizeExternalProfileUrl(profile.platform, profile.profileUrl);
      const match = normalizedUrl ? await profiles.findByNormalizedProfileUrl(normalizedUrl) : null;
      if (match) strongCreatorIds.add(match.creatorEntityId);
    }
  }
  if (strongCreatorIds.size > 1) return { recommendation: 'conflicting_identity' as const };
  if (strongCreatorIds.size === 1) {
    return {
      recommendation: 'likely_existing_creator' as const,
      creatorId: [...strongCreatorIds][0],
    };
  }

  const nameMatches = await createCreatorRepository(db).findByNormalizedName(
    candidate.normalizedName,
  );
  if (nameMatches.length === 1) {
    const match = nameMatches[0];
    const countryOverlap =
      candidate.countryCodes.length === 0 ||
      !match?.countryCodes ||
      candidate.countryCodes.some((country) => match.countryCodes?.includes(country));
    return countryOverlap
      ? { recommendation: 'possible_existing_creator' as const, creatorId: match?.id }
      : { recommendation: 'manual_review_required' as const };
  }
  if (nameMatches.length > 1) return { recommendation: 'manual_review_required' as const };
  return { recommendation: 'no_existing_match' as const };
}

export function createIngestionOrchestrator(options: {
  db: D1Database;
  registry: SourceConnectorRegistry;
  metadata?: RecordMetadataProvider;
  connectorContext?: SourceConnectorContext;
}) {
  const metadata = options.metadata ?? defaultRecordMetadataProvider;
  const configurations = createSourceConfigurationRepository(options.db, metadata);
  const checkpoints = createSourceCheckpointRepository(options.db, metadata);
  const locks = createSourceLockRepository(options.db, metadata);
  const runs = createIngestionRunRepository(options.db, metadata);
  const outcomes = createIngestionRecordOutcomeRepository(options.db, metadata);
  const candidates = createCreatorCandidateRepository(options.db, metadata);
  const provenance = createCandidateProvenanceRepository(options.db, metadata);

  async function execute(request: IngestionRunRequest): Promise<IngestionResult> {
    const scopeKey = request.scopeKey ?? 'default';
    const configuration = await configurations.findByName(request.sourceName);
    if (!configuration) {
      throw new IngestionError(
        'SOURCE_CONFIGURATION_NOT_FOUND',
        'The source configuration was not found.',
      );
    }
    const connector = options.registry.get(request.sourceName);
    if (!connector)
      throw new IngestionError('CONNECTOR_NOT_FOUND', 'The source connector is unavailable.');
    const readiness = connector.validateConfiguration(configuration);
    if (readiness.status !== 'ready') {
      return {
        runId: null,
        sourceName: request.sourceName,
        scopeKey,
        status: 'disabled',
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
        failedCount: 0,
        retryCount: 0,
        checkpointBefore: null,
        checkpointAfter: null,
        dryRun: request.preview || configuration.dryRun,
        message: readiness.message,
      };
    }

    const runId = metadata.createId();
    const leaseOwner = request.leaseOwner ?? `worker:${runId}`;
    const lock = await locks.acquire({
      sourceName: request.sourceName,
      scopeKey,
      runId,
      leaseOwner,
      leaseDurationMs: Math.max(30_000, request.maximumDurationMs ?? 60_000) + 30_000,
    });
    if (!lock) {
      return {
        runId: null,
        sourceName: request.sourceName,
        scopeKey,
        status: 'locked',
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
        failedCount: 0,
        retryCount: 0,
        checkpointBefore: null,
        checkpointAfter: null,
        dryRun: request.preview || configuration.dryRun,
        message: 'Another run already holds the source lease.',
      };
    }

    const checkpointBefore = await checkpoints.findBySourceScope(request.sourceName, scopeKey);
    let checkpoint = checkpointBefore;
    const dryRun = Boolean(
      request.preview || configuration.dryRun || !configuration.candidateCreationEnabled,
    );
    const run = await runs.create({
      id: runId,
      sourceName: request.sourceName,
      scopeKey,
      triggerType: request.preview ? 'manual_preview' : (request.triggerType ?? 'manual'),
      checkpointBefore: checkpointBefore?.cursor ?? null,
      dryRun,
    });
    await runs.markRunning(run.id);

    const counts: MutableCounts = {
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
      failedCount: 0,
      retryCount: 0,
    };
    const maximumDurationMs = Math.min(request.maximumDurationMs ?? 60_000, 120_000);
    const startedAt = Date.parse(metadata.now());
    const context: SourceConnectorContext = {
      ...(options.connectorContext ?? defaultConnectorContext),
      signal: request.signal ?? options.connectorContext?.signal,
    };
    let lastSourceRecordId: string | null = checkpoint?.lastSourceRecordId ?? null;
    let pageFailure = false;

    try {
      const scope = configuration.scopeConfiguration as Record<string, unknown>;
      const maximumFailedRecords =
        typeof scope.maximum_failed_records === 'number' ? scope.maximum_failed_records : 3;
      for (let pageIndex = 0; pageIndex < configuration.maximumPagesPerRun; pageIndex += 1) {
        if (context.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (Date.parse(metadata.now()) - startedAt >= maximumDurationMs) break;
        const remaining = configuration.maximumRecordsPerRun - counts.fetchedCount;
        if (remaining <= 0) break;
        const page = await connector.fetchPage({
          configuration,
          checkpoint,
          pageSize: Math.min(configuration.batchSize, remaining),
          context,
        });
        counts.retryCount += page.retryCount;
        counts.fetchedCount += page.records.length;
        pageFailure = false;

        for (const record of page.records) {
          let result: IngestionRecordResult;
          try {
            const mapped = await connector.mapRecord(record, context);
            const existing = await provenance.findBySourceEntity(
              request.sourceName,
              record.sourceRecordId,
            );
            const match = await recommendMatch(options.db, mapped);
            mapped.matchRecommendation = match.recommendation;
            mapped.possibleCreatorEntityId = match.creatorId;

            if (dryRun) {
              counts.skippedCount += 1;
              result = {
                sourceRecordId: record.sourceRecordId,
                status: 'previewed',
                candidateId: existing?.creatorCandidateId ?? null,
                errorCode: null,
                errorMessage: null,
              };
            } else if (existing) {
              const current = await candidates.findById(existing.creatorCandidateId);
              if (!current)
                throw new IngestionError(
                  'CANDIDATE_NOT_FOUND',
                  'The existing candidate was unavailable.',
                );
              const unchanged = existing.rawRecordChecksum === mapped.rawRecordChecksum;
              if (unchanged) {
                counts.duplicateCount += 1;
              } else {
                await candidates.updateDiscoveryData(current.id, {
                  canonicalName: mapped.canonicalName,
                  category: mapped.category ?? null,
                  countryCodes: mapped.countryCodes,
                  discoverySource: `${request.sourceName}:${record.sourceRecordId}`,
                  confidenceScore: 70,
                });
                counts.updatedCount += 1;
              }
              await provenance.upsert({
                creatorCandidateId: current.id,
                sourceName: request.sourceName,
                sourceEntityId: record.sourceRecordId,
                sourceUrl: mapped.provenance.sourceUrl,
                sourceLicense: mapped.provenance.sourceLicense,
                connectorVersion: mapped.provenance.connectorVersion,
                mappingVersion: mapped.provenance.mappingVersion,
                rawRecordChecksum: mapped.rawRecordChecksum,
                aliases: mapped.aliases,
                externalProfiles: mapped.externalProfiles,
                matchRecommendation: mapped.matchRecommendation,
                possibleCreatorEntityId: mapped.possibleCreatorEntityId,
                warnings: mapped.warnings,
                retrievedAt: mapped.provenance.retrievedAt,
              });
              result = {
                sourceRecordId: record.sourceRecordId,
                status: unchanged ? 'duplicate' : 'updated',
                candidateId: current.id,
                errorCode: null,
                errorMessage: null,
              };
            } else {
              const created = await candidates.create({
                canonicalName: mapped.canonicalName,
                category: mapped.category ?? null,
                countryCodes: mapped.countryCodes,
                discoverySource: `${request.sourceName}:${record.sourceRecordId}`,
                confidenceScore: 70,
              });
              await provenance.upsert({
                creatorCandidateId: created.id,
                sourceName: request.sourceName,
                sourceEntityId: record.sourceRecordId,
                sourceUrl: mapped.provenance.sourceUrl,
                sourceLicense: mapped.provenance.sourceLicense,
                connectorVersion: mapped.provenance.connectorVersion,
                mappingVersion: mapped.provenance.mappingVersion,
                rawRecordChecksum: mapped.rawRecordChecksum,
                aliases: mapped.aliases,
                externalProfiles: mapped.externalProfiles,
                matchRecommendation: mapped.matchRecommendation,
                possibleCreatorEntityId: mapped.possibleCreatorEntityId,
                warnings: mapped.warnings,
                retrievedAt: mapped.provenance.retrievedAt,
              });
              counts.createdCount += 1;
              result = {
                sourceRecordId: record.sourceRecordId,
                status: 'created',
                candidateId: created.id,
                errorCode: null,
                errorMessage: null,
              };
            }
            lastSourceRecordId = record.sourceRecordId;
          } catch (error) {
            const safe = safeError(error);
            counts.failedCount += 1;
            result = {
              sourceRecordId: record.sourceRecordId,
              status: 'failed',
              candidateId: null,
              errorCode: safe.code,
              errorMessage: safe.message,
            };
            if (counts.failedCount > maximumFailedRecords) pageFailure = true;
          }
          await outcomes.append({
            ingestionRunId: run.id,
            sourceRecordId: result.sourceRecordId,
            idempotencyKey: `${pageIndex}:${result.sourceRecordId ?? 'unknown'}`,
            outcomeStatus: result.status,
            candidateId: result.candidateId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          });
          if (pageFailure) break;
        }

        if (pageFailure) {
          await checkpoints.recordFailure({
            sourceName: request.sourceName,
            scopeKey,
            connectorVersion: connector.connectorVersion,
            nextAllowedAttemptAt: null,
            metadata: { error_code: 'RECORD_FAILURE_THRESHOLD' },
          });
          break;
        }
        checkpoint = await checkpoints.recordSuccess({
          sourceName: request.sourceName,
          scopeKey,
          connectorVersion: connector.connectorVersion,
          cursor: page.nextCursor,
          lastSourceRecordId,
          metadata: { complete: page.complete },
        });
        if (page.complete || page.nextCursor === null) break;
        if (configuration.minimumRequestIntervalMs > 0) {
          await context.sleep(configuration.minimumRequestIntervalMs, context.signal);
        }
      }

      const errorSummary = pageFailure ? 'The record failure threshold was exceeded.' : null;
      await runs.markCompleted(
        run.id,
        {
          fetchedCount: counts.fetchedCount,
          importedCount: counts.createdCount,
          updatedCount: counts.updatedCount,
          duplicateCount: counts.duplicateCount,
          skippedCount: counts.skippedCount,
          failedCount: counts.failedCount,
          retryCount: counts.retryCount,
        },
        errorSummary,
        checkpoint?.cursor ?? null,
      );
      return {
        runId: run.id,
        sourceName: request.sourceName,
        scopeKey,
        status: counts.failedCount > 0 ? 'completed_with_errors' : 'completed',
        ...counts,
        checkpointBefore: checkpointBefore?.cursor ?? null,
        checkpointAfter: checkpoint?.cursor ?? null,
        dryRun,
        message: errorSummary ?? 'The bounded ingestion run completed.',
      };
    } catch (error) {
      const safe = safeError(error);
      await checkpoints.recordFailure({
        sourceName: request.sourceName,
        scopeKey,
        connectorVersion: connector.connectorVersion,
        nextAllowedAttemptAt: null,
        metadata: { error_code: safe.code },
      });
      await runs.markFailed(run.id, safe.message);
      return {
        runId: run.id,
        sourceName: request.sourceName,
        scopeKey,
        status: 'failed',
        ...counts,
        checkpointBefore: checkpointBefore?.cursor ?? null,
        checkpointAfter: checkpoint?.cursor ?? null,
        dryRun,
        message: safe.message,
      };
    } finally {
      await locks.release(request.sourceName, scopeKey, run.id, leaseOwner);
    }
  }

  return { execute };
}

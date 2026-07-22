import type {
  ConnectorReadinessStatus,
  EntityMatchRecommendation,
  ExternalProfilePlatform,
  SourceAccessMode,
} from '@open-creator-registry/contracts/sources';
import type { SourceCheckpoint, SourceConfiguration } from '@open-creator-registry/database/models';

export type SourceProvenance = {
  sourceName: string;
  sourceEntityId: string;
  sourceUrl: string;
  sourceLicense: string;
  retrievedAt: string;
  connectorVersion: string;
  mappingVersion: string;
};

export type MappedExternalProfile = {
  platform: ExternalProfilePlatform;
  platformAccountId?: string;
  platformHandle?: string;
  profileUrl?: string;
  profileName?: string;
};

export type MappedCreatorCandidate = {
  canonicalName: string;
  normalizedName: string;
  category?: string;
  countryCodes: string[];
  aliases: string[];
  description?: string;
  occupationIds: string[];
  externalProfiles: MappedExternalProfile[];
  provenance: SourceProvenance;
  rawRecordChecksum: string;
  matchRecommendation?: EntityMatchRecommendation;
  possibleCreatorEntityId?: string;
  warnings: string[];
};

export type SourceRecord = {
  sourceRecordId: string;
  value: unknown;
};

export type SourcePage = {
  records: SourceRecord[];
  nextCursor: string | null;
  complete: boolean;
  retryCount: number;
};

export type SourceConnectorContext = {
  fetch: typeof fetch;
  now(): string;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
  scheduleTimeout(callback: () => void, milliseconds: number): () => void;
  random(): number;
  userAgent?: string;
  signal?: AbortSignal;
};

export type ConnectorReadiness = {
  status: ConnectorReadinessStatus;
  message: string;
};

export type SourceConnector = {
  sourceName: string;
  connectorVersion: string;
  mappingVersion: string;
  accessMode: SourceAccessMode;
  validateConfiguration(configuration: SourceConfiguration): ConnectorReadiness;
  fetchPage(input: {
    configuration: SourceConfiguration;
    checkpoint: SourceCheckpoint | null;
    pageSize: number;
    context: SourceConnectorContext;
  }): Promise<SourcePage>;
  mapRecord(record: SourceRecord, context: SourceConnectorContext): Promise<MappedCreatorCandidate>;
};

export type IngestionRecordResult = {
  sourceRecordId: string | null;
  status: 'created' | 'updated' | 'duplicate' | 'skipped' | 'failed' | 'previewed';
  candidateId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type IngestionResult = {
  runId: string | null;
  sourceName: string;
  scopeKey: string;
  status: 'disabled' | 'locked' | 'completed' | 'completed_with_errors' | 'failed';
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
  checkpointBefore: string | null;
  checkpointAfter: string | null;
  dryRun: boolean;
  message: string;
};

export class IngestionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

export const defaultConnectorContext: SourceConnectorContext = {
  fetch,
  now: () => new Date().toISOString(),
  sleep: async (milliseconds, signal) => {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  },
  scheduleTimeout: (callback, milliseconds) => {
    const timeout = setTimeout(callback, milliseconds);
    return () => clearTimeout(timeout);
  },
  random: Math.random,
  userAgent: 'OpenCreatorRegistry/0.1 (local-development; connector disabled by default)',
};

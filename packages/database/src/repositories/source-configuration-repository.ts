import type {
  SourceAccessMode,
  SourceConfigurationStatus,
} from '@open-creator-registry/contracts/sources';

import { createNotFoundError } from '../errors';
import { parseJson, serializeJson, type JsonValue } from '../json';
import type { PaginatedResult, Pagination, SourceConfiguration } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

type SourceConfigurationRow = {
  source_name: string;
  enabled: number;
  scheduled_enabled: number;
  connector_version: string;
  access_mode: SourceAccessMode;
  base_url: string;
  batch_size: number;
  maximum_pages_per_run: number;
  maximum_records_per_run: number;
  timeout_ms: number;
  retry_count: number;
  minimum_request_interval_ms: number;
  scope_configuration: string;
  candidate_creation_enabled: number;
  dry_run: number;
  source_license: string;
  attribution: string;
  configuration_status: SourceConfigurationStatus;
  created_at: string;
  updated_at: string;
};

function mapConfiguration(row: SourceConfigurationRow): SourceConfiguration {
  return {
    sourceName: row.source_name,
    enabled: row.enabled === 1,
    scheduledEnabled: row.scheduled_enabled === 1,
    connectorVersion: row.connector_version,
    accessMode: row.access_mode,
    baseUrl: row.base_url,
    batchSize: row.batch_size,
    maximumPagesPerRun: row.maximum_pages_per_run,
    maximumRecordsPerRun: row.maximum_records_per_run,
    timeoutMs: row.timeout_ms,
    retryCount: row.retry_count,
    minimumRequestIntervalMs: row.minimum_request_interval_ms,
    scopeConfiguration: parseJson(row.scope_configuration, 'source configuration scope'),
    candidateCreationEnabled: row.candidate_creation_enabled === 1,
    dryRun: row.dry_run === 1,
    sourceLicense: row.source_license,
    attribution: row.attribution,
    configurationStatus: row.configuration_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type SourceConfigurationWriteInput = {
  sourceName: string;
  enabled: boolean;
  scheduledEnabled: boolean;
  connectorVersion: string;
  accessMode: SourceAccessMode;
  baseUrl: string;
  batchSize: number;
  maximumPagesPerRun: number;
  maximumRecordsPerRun: number;
  timeoutMs: number;
  retryCount: number;
  minimumRequestIntervalMs: number;
  scopeConfiguration: JsonValue;
  candidateCreationEnabled: boolean;
  dryRun: boolean;
  sourceLicense: string;
  attribution: string;
  configurationStatus: SourceConfigurationStatus;
};

export const defaultWikidataSourceConfiguration: SourceConfigurationWriteInput = {
  sourceName: 'wikidata',
  enabled: false,
  scheduledEnabled: false,
  connectorVersion: '0.1.0-poc',
  accessMode: 'official_api',
  baseUrl: 'https://query.wikidata.org/sparql',
  batchSize: 10,
  maximumPagesPerRun: 2,
  maximumRecordsPerRun: 20,
  timeoutMs: 5000,
  retryCount: 2,
  minimumRequestIntervalMs: 1000,
  scopeConfiguration: {
    occupation_ids: ['Q177220', 'Q639669'],
    country_ids: [],
    maximum_failed_records: 3,
  },
  candidateCreationEnabled: true,
  dryRun: true,
  sourceLicense: 'CC0-1.0',
  attribution: 'Wikidata contributors',
  configurationStatus: 'valid',
};

export function createSourceConfigurationRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findByName(sourceName: string): Promise<SourceConfiguration | null> {
    const row = await firstRow<SourceConfigurationRow>(
      db
        .prepare('SELECT * FROM source_configurations WHERE source_name = ? LIMIT 1')
        .bind(sourceName),
      'sourceConfiguration.findByName',
    );
    return row ? mapConfiguration(row) : null;
  }

  async function upsert(input: SourceConfigurationWriteInput): Promise<SourceConfiguration> {
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO source_configurations (
            source_name, enabled, scheduled_enabled, connector_version, access_mode, base_url,
            batch_size, maximum_pages_per_run, maximum_records_per_run, timeout_ms, retry_count,
            minimum_request_interval_ms, scope_configuration, candidate_creation_enabled, dry_run,
            source_license, attribution, configuration_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_name) DO UPDATE SET enabled = excluded.enabled,
            scheduled_enabled = excluded.scheduled_enabled,
            connector_version = excluded.connector_version, access_mode = excluded.access_mode,
            base_url = excluded.base_url, batch_size = excluded.batch_size,
            maximum_pages_per_run = excluded.maximum_pages_per_run,
            maximum_records_per_run = excluded.maximum_records_per_run,
            timeout_ms = excluded.timeout_ms, retry_count = excluded.retry_count,
            minimum_request_interval_ms = excluded.minimum_request_interval_ms,
            scope_configuration = excluded.scope_configuration,
            candidate_creation_enabled = excluded.candidate_creation_enabled,
            dry_run = excluded.dry_run, source_license = excluded.source_license,
            attribution = excluded.attribution,
            configuration_status = excluded.configuration_status, updated_at = excluded.updated_at`,
        )
        .bind(
          input.sourceName,
          input.enabled ? 1 : 0,
          input.scheduledEnabled ? 1 : 0,
          input.connectorVersion,
          input.accessMode,
          input.baseUrl,
          input.batchSize,
          input.maximumPagesPerRun,
          input.maximumRecordsPerRun,
          input.timeoutMs,
          input.retryCount,
          input.minimumRequestIntervalMs,
          serializeJson(input.scopeConfiguration),
          input.candidateCreationEnabled ? 1 : 0,
          input.dryRun ? 1 : 0,
          input.sourceLicense,
          input.attribution,
          input.configurationStatus,
          timestamp,
          timestamp,
        ),
      'sourceConfiguration.upsert',
    );
    const saved = await findByName(input.sourceName);
    if (!saved) throw createNotFoundError('source configuration', input.sourceName);
    return saved;
  }

  async function list(pagination: Pagination = {}): Promise<PaginatedResult<SourceConfiguration>> {
    const { page, limit, offset } = resolvePagination(pagination);
    const rows = await allRows<SourceConfigurationRow>(
      db
        .prepare('SELECT * FROM source_configurations ORDER BY source_name LIMIT ? OFFSET ?')
        .bind(limit, offset),
      'sourceConfiguration.list',
    );
    return { items: rows.map(mapConfiguration), page, limit };
  }

  async function count(): Promise<number> {
    return (
      (
        await firstRow<{ count: number }>(
          db.prepare('SELECT COUNT(*) AS count FROM source_configurations'),
          'sourceConfiguration.count',
        )
      )?.count ?? 0
    );
  }

  async function listScheduledEnabled(): Promise<SourceConfiguration[]> {
    const rows = await allRows<SourceConfigurationRow>(
      db.prepare(
        `SELECT * FROM source_configurations WHERE enabled = 1 AND scheduled_enabled = 1
         AND configuration_status = 'valid' ORDER BY source_name`,
      ),
      'sourceConfiguration.listScheduledEnabled',
    );
    return rows.map(mapConfiguration);
  }

  return { findByName, upsert, list, count, listScheduledEnabled };
}

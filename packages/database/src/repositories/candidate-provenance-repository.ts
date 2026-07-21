import type { EntityMatchRecommendation } from '@open-creator-registry/contracts/sources';

import { parseJson, serializeJson, type JsonValue } from '../json';
import type { CandidateSourceProvenance } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, runStatement } from './shared';

type ProvenanceRow = {
  id: string;
  creator_candidate_id: string;
  source_name: string;
  source_entity_id: string;
  source_url: string;
  source_license: string;
  connector_version: string;
  mapping_version: string;
  raw_record_checksum: string;
  aliases: string;
  external_profiles: string;
  match_recommendation: EntityMatchRecommendation;
  possible_creator_entity_id: string | null;
  warnings: string;
  first_seen_at: string;
  last_seen_at: string;
  retrieved_at: string;
  created_at: string;
  updated_at: string;
};

function mapProvenance(row: ProvenanceRow): CandidateSourceProvenance {
  return {
    id: row.id,
    creatorCandidateId: row.creator_candidate_id,
    sourceName: row.source_name,
    sourceEntityId: row.source_entity_id,
    sourceUrl: row.source_url,
    sourceLicense: row.source_license,
    connectorVersion: row.connector_version,
    mappingVersion: row.mapping_version,
    rawRecordChecksum: row.raw_record_checksum,
    aliases: parseJson(row.aliases, 'candidate provenance aliases'),
    externalProfiles: parseJson(row.external_profiles, 'candidate provenance external profiles'),
    matchRecommendation: row.match_recommendation,
    possibleCreatorEntityId: row.possible_creator_entity_id,
    warnings: parseJson(row.warnings, 'candidate provenance warnings'),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    retrievedAt: row.retrieved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCandidateProvenanceRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findBySourceEntity(sourceName: string, sourceEntityId: string) {
    const row = await firstRow<ProvenanceRow>(
      db
        .prepare(
          `SELECT * FROM candidate_source_provenance
           WHERE source_name = ? AND source_entity_id = ? LIMIT 1`,
        )
        .bind(sourceName, sourceEntityId),
      'candidateProvenance.findBySourceEntity',
    );
    return row ? mapProvenance(row) : null;
  }

  async function listByCandidate(creatorCandidateId: string) {
    const rows = await allRows<ProvenanceRow>(
      db
        .prepare(
          `SELECT * FROM candidate_source_provenance WHERE creator_candidate_id = ?
           ORDER BY last_seen_at DESC, id DESC`,
        )
        .bind(creatorCandidateId),
      'candidateProvenance.listByCandidate',
    );
    return rows.map(mapProvenance);
  }

  async function upsert(input: {
    creatorCandidateId: string;
    sourceName: string;
    sourceEntityId: string;
    sourceUrl: string;
    sourceLicense: string;
    connectorVersion: string;
    mappingVersion: string;
    rawRecordChecksum: string;
    aliases: JsonValue;
    externalProfiles: JsonValue;
    matchRecommendation: EntityMatchRecommendation;
    possibleCreatorEntityId?: string | null;
    warnings: JsonValue;
    retrievedAt: string;
  }): Promise<CandidateSourceProvenance> {
    const existing = await findBySourceEntity(input.sourceName, input.sourceEntityId);
    const id = existing?.id ?? metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO candidate_source_provenance (
            id, creator_candidate_id, source_name, source_entity_id, source_url, source_license,
            connector_version, mapping_version, raw_record_checksum, aliases, external_profiles,
            match_recommendation, possible_creator_entity_id, warnings, first_seen_at, last_seen_at,
            retrieved_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_name, source_entity_id) DO UPDATE SET
            creator_candidate_id = excluded.creator_candidate_id, source_url = excluded.source_url,
            source_license = excluded.source_license, connector_version = excluded.connector_version,
            mapping_version = excluded.mapping_version,
            raw_record_checksum = excluded.raw_record_checksum, aliases = excluded.aliases,
            external_profiles = excluded.external_profiles,
            match_recommendation = excluded.match_recommendation,
            possible_creator_entity_id = excluded.possible_creator_entity_id,
            warnings = excluded.warnings, last_seen_at = excluded.last_seen_at,
            retrieved_at = excluded.retrieved_at, updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          input.creatorCandidateId,
          input.sourceName,
          input.sourceEntityId,
          input.sourceUrl,
          input.sourceLicense,
          input.connectorVersion,
          input.mappingVersion,
          input.rawRecordChecksum,
          serializeJson(input.aliases),
          serializeJson(input.externalProfiles),
          input.matchRecommendation,
          input.possibleCreatorEntityId ?? null,
          serializeJson(input.warnings),
          existing?.firstSeenAt ?? timestamp,
          timestamp,
          input.retrievedAt,
          timestamp,
          timestamp,
        ),
      'candidateProvenance.upsert',
    );
    const saved = await findBySourceEntity(input.sourceName, input.sourceEntityId);
    if (!saved) throw new Error('The candidate source provenance could not be read after upsert.');
    return saved;
  }

  return { findBySourceEntity, listByCandidate, upsert };
}

import { z } from 'zod';

import { registryClassifications } from '@open-creator-registry/contracts/classifications';
import {
  aliasTypes,
  creatorProtectionTiers,
  creatorReviewStatuses,
  reservationStatuses,
  sourceVerificationStatuses,
} from '@open-creator-registry/contracts/domain';
import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import {
  createImportBatchRepository,
  type ImportPreviewError,
  type ValidatedImportRecord,
} from '@open-creator-registry/database/repositories/import-batch-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import {
  createConfusableSkeleton,
  normalizeCreatorName,
  normalizeHandle,
} from '@open-creator-registry/normalization';

const maximumRows = 500;
const commonNameSignals = new Set([
  'alex lee',
  'alex smith',
  'chris lee',
  'jordan lee',
  'sam taylor',
]);

const countryCodesSchema = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return value.map((item: unknown) => item);
    if (typeof value !== 'string' || value.trim() === '') return null;
    return value.split(/[|;]/u).map((country) => country.trim().toUpperCase());
  },
  z
    .array(z.string().regex(/^[A-Z]{2}$/u))
    .max(20)
    .nullable(),
);

const nullableString = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().max(2_000).nullable(),
);

const creatorImportSchema = z.object({
  record_type: z.literal('creator'),
  canonical_name: z.string().trim().min(2).max(160),
  entity_type: z.string().trim().min(2).max(80).default('person'),
  primary_category: nullableString,
  country_codes: countryCodesSchema,
  biography_summary: nullableString,
  notoriety_score: z.coerce.number().int().min(0).max(100).default(0),
  protection_tier: z.enum(creatorProtectionTiers).default('standard'),
  review_status: z.enum(creatorReviewStatuses).default('pending'),
});

const aliasImportSchema = z.object({
  record_type: z.literal('alias'),
  creator_name: z.string().trim().min(2).max(160),
  alias: z.string().trim().min(2).max(80),
  language: nullableString,
  alias_type: z.enum(aliasTypes),
  confidence_score: z.coerce.number().int().min(0).max(100),
  source_id: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().uuid().nullable(),
  ),
});

const sourceImportSchema = z.object({
  record_type: z.literal('source'),
  creator_name: z.string().trim().min(2).max(160),
  source_name: z.string().trim().min(2).max(100),
  source_entity_id: z.string().trim().min(1).max(200),
  source_url: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z
      .string()
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
      .nullable(),
  ),
  source_license: nullableString,
  verification_status: z.enum(sourceVerificationStatuses).default('pending'),
  last_checked_at: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().datetime().nullable(),
  ),
});

const handleImportSchema = z.object({
  record_type: z.literal('handle'),
  creator_name: z.string().trim().min(2).max(160),
  display_handle: z.string().trim().min(2).max(80),
  classification: z.enum(registryClassifications),
  confidence_score: z.coerce.number().int().min(0).max(100),
  decision_source: z.string().trim().min(2).max(160),
  reason: z.string().trim().min(10).max(2_000),
  status: z.enum(reservationStatuses).default('active'),
});

const importRecordSchema = z.discriminatedUnion('record_type', [
  creatorImportSchema,
  aliasImportSchema,
  sourceImportSchema,
  handleImportSchema,
]);

const validatedImportRecordSchema = z.discriminatedUnion('recordType', [
  z.object({
    recordType: z.literal('creator'),
    id: z.string().uuid(),
    canonicalName: z.string().min(2).max(160),
    normalizedName: z.string().min(1),
    entityType: z.string().min(2).max(80),
    primaryCategory: z.string().nullable(),
    countryCodes: z
      .array(z.string().regex(/^[A-Z]{2}$/u))
      .max(20)
      .nullable(),
    biographySummary: z.string().max(2_000).nullable(),
    notorietyScore: z.number().int().min(0).max(100),
    protectionTier: z.enum(creatorProtectionTiers),
    reviewStatus: z.enum(creatorReviewStatuses),
  }),
  z.object({
    recordType: z.literal('alias'),
    id: z.string().uuid(),
    creatorEntityId: z.string().uuid(),
    alias: z.string().min(2).max(80),
    normalizedAlias: z.string().min(1),
    confusableSkeleton: z.string().min(1),
    language: z.string().nullable(),
    aliasType: z.enum(aliasTypes),
    confidenceScore: z.number().int().min(0).max(100),
    sourceId: z.string().uuid().nullable(),
  }),
  z.object({
    recordType: z.literal('source'),
    id: z.string().uuid(),
    creatorEntityId: z.string().uuid(),
    sourceName: z.string().min(2).max(100),
    sourceEntityId: z.string().min(1).max(200),
    sourceUrl: z.string().url().nullable(),
    sourceLicense: z.string().nullable(),
    verificationStatus: z.enum(sourceVerificationStatuses),
    lastCheckedAt: z.string().datetime().nullable(),
  }),
  z.object({
    recordType: z.literal('handle'),
    id: z.string().uuid(),
    creatorEntityId: z.string().uuid(),
    displayHandle: z.string().min(2).max(80),
    normalizedHandle: z.string().min(1),
    confusableSkeleton: z.string().min(1),
    classification: z.enum(registryClassifications),
    confidenceScore: z.number().int().min(0).max(100),
    decisionSource: z.string().min(2).max(160),
    reason: z.string().min(10).max(2_000),
    status: z.enum(reservationStatuses),
    requiresApproval: z.boolean(),
  }),
]);

export class AdminImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminImportValidationError';
  }
}

function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('The CSV input contains an unterminated quoted field.');
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/u, ''));
    rows.push(row);
  }
  const header = rows.shift()?.map((value) => value.trim());
  if (!header || header.length === 0 || header.some((value) => !value)) {
    throw new Error('The CSV input requires a non-empty header row.');
  }
  return rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function parseRows(format: 'csv' | 'json', content: string): unknown[] {
  if (format === 'csv') return parseCsv(content);
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) throw new Error('The JSON import must contain one array of records.');
  return parsed;
}

function issueFromZod(rowNumber: number, error: z.ZodError): ImportPreviewError {
  const issue = error.issues[0];
  return {
    rowNumber,
    errorCode: 'validation_failed',
    errorMessage: issue?.message ?? 'The import row is invalid.',
    fieldName: issue?.path.join('.') || null,
    rawValue: null,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAdminImportService(db: D1Database) {
  const creators = createCreatorRepository(db);
  const aliases = createCreatorAliasRepository(db);
  const sources = createCreatorSourceRepository(db);
  const handles = createReservedHandleRepository(db);
  const batches = createImportBatchRepository(db);

  async function preview(input: {
    format: 'csv' | 'json';
    fileName: string;
    content: string;
    actorIdentifier: string;
  }) {
    let rows: unknown[];
    try {
      rows = parseRows(input.format, input.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The import could not be parsed.';
      const payload = { records: [], warnings: [] };
      const checksum = await sha256(JSON.stringify(payload));
      const batch = await batches.createPreview({
        format: input.format,
        fileName: input.fileName,
        checksum,
        totalRows: 1,
        validRows: 0,
        invalidRows: 1,
        duplicateRows: 0,
        warningRows: 0,
        validatedPayload: payload,
        createdBy: input.actorIdentifier,
        errors: [{ rowNumber: 1, errorCode: 'parse_failed', errorMessage: message }],
      });
      return { batch, records: [], errors: await batches.listErrors(batch.id), warnings: [] };
    }
    if (rows.length > maximumRows)
      throw new AdminImportValidationError(
        `Imports are limited to ${String(maximumRows)} records.`,
      );

    const validated: ValidatedImportRecord[] = [];
    const errors: ImportPreviewError[] = [];
    const warnings: Array<{ row_number: number; code: string; message: string }> = [];
    const previewCreators = new Map<string, { id: string; tier: string }>();
    const existingCreators = new Map<string, { id: string; tier: string }>();
    const seenAliases = new Set<string>();
    const seenSources = new Set<string>();
    const seenHandles = new Set<string>();
    let duplicates = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const parsed = importRecordSchema.safeParse(rows[index]);
      if (!parsed.success) {
        errors.push(issueFromZod(rowNumber, parsed.error));
        continue;
      }
      const record = parsed.data;
      if (record.record_type === 'creator') {
        const normalizedName = normalizeCreatorName(record.canonical_name);
        const existing = await creators.findByNormalizedName(record.canonical_name);
        if (existing.length > 0 || previewCreators.has(normalizedName)) {
          duplicates += 1;
          warnings.push({
            row_number: rowNumber,
            code: 'duplicate_creator',
            message:
              'An exact normalized creator name already exists or is repeated in this preview.',
          });
          if (existing[0])
            existingCreators.set(normalizedName, {
              id: existing[0].id,
              tier: existing[0].protectionTier,
            });
          continue;
        }
        const id = crypto.randomUUID();
        previewCreators.set(normalizedName, { id, tier: record.protection_tier });
        validated.push({
          recordType: 'creator',
          id,
          canonicalName: record.canonical_name,
          normalizedName,
          entityType: record.entity_type,
          primaryCategory: record.primary_category,
          countryCodes: record.country_codes,
          biographySummary: record.biography_summary,
          notorietyScore: record.notoriety_score,
          protectionTier: record.protection_tier,
          reviewStatus: record.review_status,
        });
        if (commonNameSignals.has(normalizedName))
          warnings.push({
            row_number: rowNumber,
            code: 'common_name',
            message:
              'This common name requires manual duplicate review and does not prove identity.',
          });
        continue;
      }

      const normalizedCreatorName = normalizeCreatorName(record.creator_name);
      let creator =
        previewCreators.get(normalizedCreatorName) ?? existingCreators.get(normalizedCreatorName);
      if (!creator) {
        const matches = await creators.findByNormalizedName(record.creator_name);
        if (matches.length === 1 && matches[0]) {
          creator = { id: matches[0].id, tier: matches[0].protectionTier };
          existingCreators.set(normalizedCreatorName, creator);
        }
      }
      if (!creator) {
        errors.push({
          rowNumber,
          errorCode: 'creator_not_found',
          errorMessage: 'The related creator must exist or appear earlier in this import.',
          fieldName: 'creator_name',
          rawValue: record.creator_name,
        });
        continue;
      }

      if (record.record_type === 'alias') {
        const normalizedAlias = normalizeHandle(record.alias);
        const duplicateKey = `${creator.id}:${normalizedAlias}`;
        const existing = await aliases.findByNormalizedAlias(record.alias);
        if (
          seenAliases.has(duplicateKey) ||
          existing.some((item) => item.creatorEntityId === creator.id)
        ) {
          duplicates += 1;
          continue;
        }
        seenAliases.add(duplicateKey);
        validated.push({
          recordType: 'alias',
          id: crypto.randomUUID(),
          creatorEntityId: creator.id,
          alias: record.alias,
          normalizedAlias,
          confusableSkeleton: createConfusableSkeleton(normalizedAlias),
          language: record.language,
          aliasType: record.alias_type,
          confidenceScore: record.confidence_score,
          sourceId: record.source_id,
        });
        continue;
      }

      if (record.record_type === 'source') {
        const duplicateKey = `${record.source_name}:${record.source_entity_id}`;
        if (
          seenSources.has(duplicateKey) ||
          (await sources.findByExternalIdentity(record.source_name, record.source_entity_id))
        ) {
          duplicates += 1;
          continue;
        }
        seenSources.add(duplicateKey);
        validated.push({
          recordType: 'source',
          id: crypto.randomUUID(),
          creatorEntityId: creator.id,
          sourceName: record.source_name,
          sourceEntityId: record.source_entity_id,
          sourceUrl: record.source_url,
          sourceLicense: record.source_license,
          verificationStatus: record.verification_status,
          lastCheckedAt: record.last_checked_at,
        });
        continue;
      }

      const normalizedHandle = normalizeHandle(record.display_handle);
      if (seenHandles.has(normalizedHandle) || (await handles.findExact(record.display_handle))) {
        duplicates += 1;
        warnings.push({
          row_number: rowNumber,
          code: 'handle_conflict',
          message: 'The globally normalized handle already exists and will not be overwritten.',
        });
        continue;
      }
      seenHandles.add(normalizedHandle);
      const skeleton = createConfusableSkeleton(normalizedHandle);
      const confusable = await handles.findByConfusableSkeleton(skeleton);
      if (confusable.length > 0)
        warnings.push({
          row_number: rowNumber,
          code: 'confusable_handle',
          message:
            'A confusable-skeleton risk signal requires human review; it is not identity proof.',
        });
      const requiresApproval =
        creator.tier === 'critical' && record.classification === 'hard_reserved';
      if (requiresApproval)
        warnings.push({
          row_number: rowNumber,
          code: 'critical_approval',
          message: 'This critical hard reservation will be routed to second-person approval.',
        });
      validated.push({
        recordType: 'handle',
        id: crypto.randomUUID(),
        creatorEntityId: creator.id,
        displayHandle: record.display_handle,
        normalizedHandle,
        confusableSkeleton: skeleton,
        classification: record.classification,
        confidenceScore: record.confidence_score,
        decisionSource: record.decision_source,
        reason: record.reason,
        status: record.status,
        requiresApproval,
      });
    }

    const records = validated.toSorted((left, right) => {
      const order = { creator: 0, source: 1, alias: 2, handle: 3 } as const;
      return order[left.recordType] - order[right.recordType];
    });
    const payload = { records, warnings };
    const checksum = await sha256(JSON.stringify(payload));
    const batch = await batches.createPreview({
      format: input.format,
      fileName: input.fileName,
      checksum,
      totalRows: rows.length,
      validRows: records.length,
      invalidRows: errors.length,
      duplicateRows: duplicates,
      warningRows: warnings.length,
      validatedPayload: payload,
      createdBy: input.actorIdentifier,
      errors,
    });
    return { batch, records, errors: await batches.listErrors(batch.id), warnings };
  }

  return { preview, maximumRows };
}

export function validatedRecordsFromPayload(payload: unknown): ValidatedImportRecord[] {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('records' in payload) ||
    !Array.isArray(payload.records)
  ) {
    throw new AdminImportValidationError('The stored import preview payload is invalid.');
  }
  const parsed = z.array(validatedImportRecordSchema).safeParse(payload.records);
  if (!parsed.success) {
    throw new AdminImportValidationError(
      'The stored import preview records failed integrity validation.',
    );
  }
  return parsed.data;
}

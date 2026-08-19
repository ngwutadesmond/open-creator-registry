import { z } from 'zod';

import {
  normalizeCountryInput,
  normalizePublicSourceUrl,
  normalizeSubmissionCategoryInput,
} from '@open-creator-registry/contracts/submissions';
import { RegistryDatabaseError } from '@open-creator-registry/database/errors';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import type { CreatePublicSubmissionInput } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import {
  normalizeCreatorName,
  normalizeHandle,
  validateHandle,
} from '@open-creator-registry/normalization';

import {
  bulkSubmissionCommitDataSchema,
  bulkSubmissionCommitRequestSchema,
  bulkSubmissionPreviewDataSchema,
  bulkSubmissionPreviewRequestSchema,
} from './schemas';
import {
  createPreviewChecksum,
  createSubmissionFingerprint,
  deterministicUuid,
} from './submission-policy';

type BulkSourceRow = z.infer<typeof bulkSubmissionPreviewRequestSchema>['rows'][number];
type BulkPreviewData = z.infer<typeof bulkSubmissionPreviewDataSchema>;
type BulkPreviewRow = BulkPreviewData['rows'][number];
type BulkCommitInput = z.infer<typeof bulkSubmissionCommitRequestSchema>;
type BulkCommitData = z.infer<typeof bulkSubmissionCommitDataSchema>;
type BulkIssue = BulkPreviewRow['errors'][number];
type NormalizedBulkRow = NonNullable<BulkPreviewRow['normalized']>;

export type BulkSubmissionErrorDetail = {
  code: string;
  message: string;
  path: string;
};

export class BulkSubmissionValidationError extends Error {
  readonly code: string;
  readonly details: BulkSubmissionErrorDetail[];

  constructor(code: string, message: string, details: BulkSubmissionErrorDetail[] = []) {
    super(message);
    this.name = 'BulkSubmissionValidationError';
    this.code = code;
    this.details = details;
  }
}

function issue(code: string, field: BulkIssue['field'], message: string): BulkIssue {
  return { code, field, message };
}

function canonicalPreviewRows(rows: BulkSourceRow[]) {
  return rows.map((row) => ({
    row_number: row.row_number,
    creator_name: row.creator_name.trim(),
    category: row.category.trim(),
    countries: row.countries.map((value) => value.trim()),
    requested_usernames: row.requested_usernames.map((value) => value.trim()),
    public_sources: row.public_sources.map((value) => value.trim()),
  }));
}

async function validateRow(
  row: BulkSourceRow,
  duplicateRowNumber: boolean,
): Promise<BulkPreviewRow> {
  const errors: BulkIssue[] = [];
  const creatorName = row.creator_name.trim();
  if (creatorName.length < 2) {
    errors.push(issue('creator_name_required', 'creator_name', 'Enter the creator’s public name.'));
  } else if (creatorName.length > 120) {
    errors.push(
      issue(
        'creator_name_too_long',
        'creator_name',
        'Creator public name must be 120 characters or fewer.',
      ),
    );
  }

  const category = normalizeSubmissionCategoryInput(row.category);
  if (!category) {
    errors.push(
      issue('unsupported_category', 'category', 'Use a supported category value or display label.'),
    );
  }

  if (row.countries.length > 10) {
    errors.push(issue('too_many_countries', 'countries', 'Use no more than 10 countries.'));
  }
  const countryCodes: string[] = [];
  const seenCountries = new Map<string, number>();
  row.countries.forEach((country, index) => {
    const normalized = normalizeCountryInput(country);
    if (!normalized) {
      errors.push(
        issue(
          'unknown_country',
          'countries',
          `Country ${index + 1} is not a supported name or ISO alpha-2 code.`,
        ),
      );
      return;
    }
    const previous = seenCountries.get(normalized);
    if (previous !== undefined) {
      errors.push(
        issue(
          'duplicate_country',
          'countries',
          `Country ${index + 1} duplicates country ${previous + 1}.`,
        ),
      );
      return;
    }
    seenCountries.set(normalized, index);
    countryCodes.push(normalized);
  });

  if (row.requested_usernames.length === 0) {
    errors.push(
      issue(
        'requested_username_required',
        'requested_usernames',
        'Enter at least one requested username.',
      ),
    );
  } else if (row.requested_usernames.length > 10) {
    errors.push(
      issue('too_many_usernames', 'requested_usernames', 'Use no more than 10 usernames.'),
    );
  }
  const requestedHandles: string[] = [];
  const seenHandles = new Map<string, number>();
  row.requested_usernames.forEach((handle, index) => {
    const value = handle.trim();
    const validation = validateHandle(value);
    if (!validation.valid) {
      errors.push(
        issue(
          'invalid_username',
          'requested_usernames',
          `Username ${index + 1}: ${validation.issues[0]?.message ?? 'Enter a supported username.'}`,
        ),
      );
      return;
    }
    const previous = seenHandles.get(validation.normalized);
    if (previous !== undefined) {
      errors.push(
        issue(
          'duplicate_username',
          'requested_usernames',
          `Username ${index + 1} duplicates username ${previous + 1} after normalization.`,
        ),
      );
      return;
    }
    seenHandles.set(validation.normalized, index);
    requestedHandles.push(value);
  });

  if (row.public_sources.length === 0) {
    errors.push(
      issue(
        'public_source_required',
        'public_sources',
        'Enter at least one public supporting source.',
      ),
    );
  } else if (row.public_sources.length > 10) {
    errors.push(issue('too_many_sources', 'public_sources', 'Use no more than 10 source URLs.'));
  }
  const publicSources: string[] = [];
  const seenSources = new Map<string, number>();
  row.public_sources.forEach((source, index) => {
    const normalized = normalizePublicSourceUrl(source);
    if (!normalized) {
      errors.push(
        issue(
          'invalid_source_url',
          'public_sources',
          `Source ${index + 1} must be a complete public HTTP or HTTPS URL.`,
        ),
      );
      return;
    }
    const previous = seenSources.get(normalized);
    if (previous !== undefined) {
      errors.push(
        issue(
          'duplicate_source_url',
          'public_sources',
          `Source ${index + 1} duplicates source ${previous + 1}.`,
        ),
      );
      return;
    }
    seenSources.set(normalized, index);
    publicSources.push(normalized);
  });

  if (duplicateRowNumber) {
    errors.push(
      issue('duplicate_row_number', 'row', 'Spreadsheet row numbers must be unique in a request.'),
    );
  }

  if (errors.length > 0 || !category) {
    return {
      row_number: row.row_number,
      status: 'invalid',
      normalized: null,
      fingerprint: null,
      duplicate_scope: null,
      duplicate_of_row: null,
      errors,
      warnings: [],
    };
  }

  const normalized: NormalizedBulkRow = {
    creator_name: creatorName,
    category,
    country_codes: countryCodes,
    requested_handles: requestedHandles,
    public_sources: publicSources,
  };
  return {
    row_number: row.row_number,
    status: 'ready',
    normalized,
    fingerprint: await createSubmissionFingerprint({
      creatorName,
      category,
      countryCodes,
      requestedHandles,
      publicSources,
    }),
    duplicate_scope: null,
    duplicate_of_row: null,
    errors: [],
    warnings: [],
  };
}

function summarize(rows: BulkPreviewRow[]): BulkPreviewData['summary'] {
  return {
    total_rows: rows.length,
    ready: rows.filter(({ status }) => status === 'ready').length,
    exact_duplicates: rows.filter(({ status }) => status === 'exact_duplicate').length,
    possible_duplicates: rows.filter(({ status }) => status === 'possible_duplicate').length,
    invalid: rows.filter(({ status }) => status === 'invalid').length,
    rows_with_warnings: rows.filter(({ warnings }) => warnings.length > 0).length,
  };
}

async function fingerprintExistingSubmission(submission: {
  creatorName: string;
  category: string | null;
  countryCodes: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
  submissionFingerprint: string | null;
}) {
  return (
    submission.submissionFingerprint ??
    createSubmissionFingerprint({
      creatorName: submission.creatorName,
      category: submission.category,
      countryCodes: submission.countryCodes,
      requestedHandles: submission.requestedHandles,
      publicSources: submission.publicSources,
    })
  );
}

export function createBulkSubmissionService(db: D1Database) {
  const submissions = createPublicSubmissionRepository(db);
  const creators = createCreatorRepository(db);
  const handles = createReservedHandleRepository(db);
  const sources = createCreatorSourceRepository(db);

  async function preview(sourceRows: BulkSourceRow[]): Promise<BulkPreviewData> {
    const rowNumberCounts = new Map<number, number>();
    sourceRows.forEach((row) =>
      rowNumberCounts.set(row.row_number, (rowNumberCounts.get(row.row_number) ?? 0) + 1),
    );
    const rows = await Promise.all(
      sourceRows.map((row) => validateRow(row, (rowNumberCounts.get(row.row_number) ?? 0) > 1)),
    );
    const validRows = rows.filter(
      (row): row is BulkPreviewRow & { normalized: NormalizedBulkRow; fingerprint: string } =>
        Boolean(row.normalized && row.fingerprint),
    );
    const normalizedNames = validRows.map((row) => row.normalized.creator_name);
    const requestedHandles = validRows.flatMap((row) => row.normalized.requested_handles);
    const sourceUrls = validRows.flatMap((row) => row.normalized.public_sources);
    const [activeSubmissions, approvedCreators, protectedHandles, verifiedSources] =
      await Promise.all([
        submissions.listActive(),
        creators.findApprovedByNormalizedNames(normalizedNames),
        handles.findProtectionCandidates(requestedHandles),
        sources.findVerifiedByUrls(sourceUrls),
      ]);

    const activeFingerprints = new Set(
      await Promise.all(activeSubmissions.map(fingerprintExistingSubmission)),
    );
    const activeNames = new Set(
      activeSubmissions.map((submission) =>
        submission.normalizedCreatorName
          ? submission.normalizedCreatorName
          : normalizeCreatorName(submission.creatorName),
      ),
    );
    const activeHandles = new Set(
      activeSubmissions.flatMap((submission) =>
        submission.requestedHandles.map((handle) => normalizeHandle(handle)),
      ),
    );
    const activePrimarySources = new Set(
      activeSubmissions.flatMap((submission) => {
        const primary = submission.publicSources[0];
        const normalized = primary ? normalizePublicSourceUrl(primary) : null;
        return normalized ? [normalized] : [];
      }),
    );
    const approvedNames = new Set(approvedCreators.map((creator) => creator.normalizedName));
    const approvedHandles = new Set(protectedHandles.map((handle) => handle.normalizedHandle));
    const approvedSourceUrls = new Set(
      verifiedSources.flatMap((source) => {
        const normalized = source.sourceUrl ? normalizePublicSourceUrl(source.sourceUrl) : null;
        return normalized ? [normalized] : [];
      }),
    );

    const firstBatchFingerprintRow = new Map<string, number>();
    rows.forEach((row) => {
      if (!row.normalized || !row.fingerprint) return;
      const firstRow = firstBatchFingerprintRow.get(row.fingerprint);
      if (firstRow !== undefined) {
        row.status = 'exact_duplicate';
        row.duplicate_scope = 'within_file';
        row.duplicate_of_row = firstRow;
        row.warnings.push(
          issue(
            'within_file_duplicate',
            'row',
            `This row duplicates spreadsheet row ${firstRow} and will be skipped.`,
          ),
        );
        return;
      }
      firstBatchFingerprintRow.set(row.fingerprint, row.row_number);
      if (activeFingerprints.has(row.fingerprint)) {
        row.status = 'exact_duplicate';
        row.duplicate_scope = 'existing';
        row.warnings.push(
          issue(
            'existing_active_duplicate',
            'row',
            'An equivalent pending or under-review submission already exists.',
          ),
        );
        return;
      }

      const normalizedName = normalizeCreatorName(row.normalized.creator_name);
      const normalizedHandles = row.normalized.requested_handles.map((handle) =>
        normalizeHandle(handle),
      );
      const primarySource = row.normalized.public_sources[0];
      if (activeNames.has(normalizedName)) {
        row.warnings.push(
          issue(
            'active_submission_same_name',
            'creator_name',
            'An active submission uses the same normalized creator name.',
          ),
        );
      }
      if (normalizedHandles.some((handle) => activeHandles.has(handle))) {
        row.warnings.push(
          issue(
            'active_submission_handle_overlap',
            'requested_usernames',
            'One or more requested usernames overlap an active submission.',
          ),
        );
      }
      if (primarySource && activePrimarySources.has(primarySource)) {
        row.warnings.push(
          issue(
            'active_submission_primary_source_overlap',
            'public_sources',
            'The primary supporting source overlaps an active submission.',
          ),
        );
      }
      if (approvedNames.has(normalizedName)) {
        row.warnings.push(
          issue(
            'approved_creator_same_name',
            'creator_name',
            'An approved creator uses the same normalized public name.',
          ),
        );
      }
      if (normalizedHandles.some((handle) => approvedHandles.has(handle))) {
        row.warnings.push(
          issue(
            'approved_creator_handle_overlap',
            'requested_usernames',
            'One or more usernames overlap reviewed Registry evidence.',
          ),
        );
      }
      if (row.normalized.public_sources.some((source) => approvedSourceUrls.has(source))) {
        row.warnings.push(
          issue(
            'approved_creator_source_overlap',
            'public_sources',
            'A supporting source is already associated with an approved creator.',
          ),
        );
      }
      if (row.warnings.length > 0) row.status = 'possible_duplicate';
    });

    return {
      preview_checksum: await createPreviewChecksum(canonicalPreviewRows(sourceRows)),
      rows,
      summary: summarize(rows),
    };
  }

  function readStoredResult(resultJson: string): BulkCommitData {
    let parsed: unknown;
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      throw new Error('Stored bulk submission result could not be parsed.');
    }
    const result = bulkSubmissionCommitDataSchema.safeParse(parsed);
    if (!result.success) throw new Error('Stored bulk submission result is invalid.');
    return { ...result.data, idempotent_replay: true };
  }

  async function commit(input: BulkCommitInput): Promise<BulkCommitData> {
    const calculatedChecksum = await createPreviewChecksum(canonicalPreviewRows(input.rows));
    if (calculatedChecksum !== input.preview_checksum) {
      throw new BulkSubmissionValidationError(
        'preview_checksum_mismatch',
        'The spreadsheet rows changed after preview. Preview the file again before submitting.',
      );
    }
    const existingBatch = await submissions.findBatchById(input.commit_id);
    if (existingBatch) {
      if (existingBatch.previewChecksum !== input.preview_checksum) {
        throw new BulkSubmissionValidationError(
          'commit_id_conflict',
          'This commit reference was already used for a different preview.',
        );
      }
      return readStoredResult(existingBatch.resultJson);
    }

    const selected = new Set(input.selected_row_numbers);
    const confirmed = new Set(input.confirmed_possible_duplicate_row_numbers);
    const knownRows = new Set(input.rows.map((row) => row.row_number));
    const unknownSelection = input.selected_row_numbers.find(
      (rowNumber) => !knownRows.has(rowNumber),
    );
    if (unknownSelection !== undefined) {
      throw new BulkSubmissionValidationError(
        'unknown_row_selection',
        'A selected spreadsheet row is not present in the preview payload.',
      );
    }
    if (
      input.confirmed_possible_duplicate_row_numbers.some((rowNumber) => !selected.has(rowNumber))
    ) {
      throw new BulkSubmissionValidationError(
        'invalid_duplicate_confirmation',
        'Possible-duplicate confirmations must refer to selected rows.',
      );
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentPreview = await preview(input.rows);
      const invalidSelected = currentPreview.rows.find(
        (row) => selected.has(row.row_number) && row.status === 'invalid',
      );
      if (invalidSelected) {
        throw new BulkSubmissionValidationError(
          'invalid_row_selected',
          `Spreadsheet row ${invalidSelected.row_number} is invalid and cannot be submitted.`,
        );
      }
      const unconfirmed = currentPreview.rows.find(
        (row) =>
          selected.has(row.row_number) &&
          row.status === 'possible_duplicate' &&
          !confirmed.has(row.row_number),
      );
      if (unconfirmed) {
        throw new BulkSubmissionValidationError(
          'possible_duplicate_confirmation_required',
          `Spreadsheet row ${unconfirmed.row_number} needs explicit possible-duplicate confirmation.`,
        );
      }

      const createdAt = new Date().toISOString();
      const inserts: CreatePublicSubmissionInput[] = [];
      const resultRows: BulkCommitData['rows'] = [];
      for (const row of currentPreview.rows) {
        const messages = [...row.errors, ...row.warnings].map(({ message }) => message);
        if (row.status === 'invalid') {
          resultRows.push({
            row_number: row.row_number,
            status: 'invalid',
            submission_id: null,
            messages,
          });
          continue;
        }
        if (row.status === 'exact_duplicate') {
          resultRows.push({
            row_number: row.row_number,
            status:
              row.duplicate_scope === 'within_file'
                ? 'skipped_within_file_duplicate'
                : 'skipped_exact_duplicate',
            submission_id: null,
            messages,
          });
          continue;
        }
        if (!selected.has(row.row_number)) {
          resultRows.push({
            row_number: row.row_number,
            status:
              row.status === 'possible_duplicate'
                ? 'excluded_possible_duplicate'
                : 'excluded_by_user',
            submission_id: null,
            messages,
          });
          continue;
        }
        if (!row.normalized || !row.fingerprint) {
          throw new Error('Validated bulk submission row is missing normalized data.');
        }
        const submissionId = await deterministicUuid(
          `${input.commit_id}:${row.row_number}:${row.fingerprint}`,
        );
        inserts.push({
          id: submissionId,
          creatorName: row.normalized.creator_name,
          normalizedCreatorName: normalizeCreatorName(row.normalized.creator_name),
          category: row.normalized.category,
          countryCodes: row.normalized.country_codes,
          requestedHandles: row.normalized.requested_handles,
          publicSources: row.normalized.public_sources,
          submissionFingerprint: row.fingerprint,
          batchReference: input.commit_id,
          batchRowNumber: row.row_number,
          createdAt,
        });
        resultRows.push({
          row_number: row.row_number,
          status: 'submitted',
          submission_id: submissionId,
          messages: [],
        });
      }

      const result: BulkCommitData = {
        batch_reference: input.commit_id,
        preview_checksum: input.preview_checksum,
        idempotent_replay: false,
        submitted_rows: resultRows.filter(({ status }) => status === 'submitted').length,
        skipped_exact_duplicates: resultRows.filter(
          ({ status }) => status === 'skipped_exact_duplicate',
        ).length,
        skipped_within_file_duplicates: resultRows.filter(
          ({ status }) => status === 'skipped_within_file_duplicate',
        ).length,
        possible_duplicates_excluded: resultRows.filter(
          ({ status }) => status === 'excluded_possible_duplicate',
        ).length,
        invalid_rows: resultRows.filter(({ status }) => status === 'invalid').length,
        failed_rows: resultRows.filter(({ status }) => status === 'failed').length,
        total_pending_submissions_created: inserts.length,
        rows: resultRows,
      };

      try {
        await submissions.commitBatch({
          id: input.commit_id,
          previewChecksum: input.preview_checksum,
          resultJson: JSON.stringify(result),
          createdAt,
          submissions: inserts,
        });
        return result;
      } catch (error) {
        if (!(error instanceof RegistryDatabaseError) || error.code !== 'unique_constraint') {
          throw error;
        }
        const racedBatch = await submissions.findBatchById(input.commit_id);
        if (racedBatch) {
          if (racedBatch.previewChecksum !== input.preview_checksum) {
            throw new BulkSubmissionValidationError(
              'commit_id_conflict',
              'This commit reference was already used for a different preview.',
            );
          }
          return readStoredResult(racedBatch.resultJson);
        }
        if (attempt === 1) throw error;
      }
    }
    throw new Error('Bulk submission commit did not complete.');
  }

  return { commit, preview };
}

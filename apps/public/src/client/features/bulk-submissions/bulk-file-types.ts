import type { BulkSubmissionColumn } from '@open-creator-registry/contracts/submissions';

import type { BulkSubmissionSourceRow } from '../../api/schemas';

export type BulkFileFormat = 'csv' | 'xlsx';

export type ParsedBulkFile = {
  fileName: string;
  fileSize: number;
  format: BulkFileFormat;
  mapping: Partial<Record<BulkSubmissionColumn, string>>;
  rows: BulkSubmissionSourceRow[];
  warnings: string[];
};

export class BulkFileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BulkFileError';
    this.code = code;
  }
}

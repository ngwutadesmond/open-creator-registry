import { maximumBulkSubmissionFileSize } from '@open-creator-registry/contracts/submissions';

import { BulkFileError, type ParsedBulkFile } from './bulk-file-types';

function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/u.exec(fileName.trim());
  return match?.[1]?.toLocaleLowerCase('en') ?? '';
}

export async function parseBulkFile(file: File, signal?: AbortSignal): Promise<ParsedBulkFile> {
  if (file.size > maximumBulkSubmissionFileSize) {
    throw new BulkFileError('file_too_large', 'The file is larger than the 2 MiB upload limit.');
  }
  if (file.size === 0) throw new BulkFileError('empty_file', 'The selected file is empty.');
  const extension = fileExtension(file.name);
  if (['xls', 'xlsm', 'ods'].includes(extension)) {
    throw new BulkFileError(
      'unsupported_file_type',
      `.${extension} files are not supported. Use a .csv or .xlsx file without macros.`,
    );
  }
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new BulkFileError('unsupported_file_type', 'Choose a CSV (.csv) or Excel (.xlsx) file.');
  }
  if (signal?.aborted) throw new DOMException('Parsing cancelled.', 'AbortError');
  const parsed =
    extension === 'csv'
      ? await (await import('./csv-file')).parseCsvFile(file)
      : await (await import('./xlsx-file')).parseXlsxFile(file);
  if (signal?.aborted) throw new DOMException('Parsing cancelled.', 'AbortError');
  return {
    fileName: file.name,
    fileSize: file.size,
    format: extension,
    ...parsed,
  };
}

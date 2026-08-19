import { BulkFileError } from './bulk-file-types';
import { parseTabularRows } from './tabular-file';

export async function parseCsvFile(file: File) {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new BulkFileError(
      'invalid_csv_encoding',
      'The CSV file must use valid UTF-8 text encoding.',
    );
  }
  if (!text.trim()) throw new BulkFileError('empty_file', 'The CSV file is empty.');
  const { default: Papa } = await import('papaparse');
  const parsed = Papa.parse<string[]>(text, {
    comments: '#',
    delimiter: ',',
    dynamicTyping: false,
    skipEmptyLines: false,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new BulkFileError(
      'malformed_csv',
      `The CSV file could not be parsed${first?.row === undefined ? '' : ` near row ${first.row + 1}`}.`,
    );
  }
  return parseTabularRows(parsed.data);
}
